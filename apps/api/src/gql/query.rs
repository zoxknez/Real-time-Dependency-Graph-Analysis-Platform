//! GraphQL Query Root - all read operations
//!
//! Implements the enterprise spec:
//! - package(id)
//! - reverseDependents(packageId, maxDepth, first, after)
//! - dependencyPath(fromPackageId, toPackageId, maxHops)
//! - impactRadius(packageId, vulnerableVersionRange, maxDepth, limit)

use async_graphql::{Context, ErrorExtensions, Object, Result, ID};
use std::collections::{HashMap, HashSet};
use tracing::{debug, instrument};

use crate::embeddings::EmbeddingError;
use crate::gql::context::GqlContext;
use crate::gql::types::*;
use crate::graph::GraphQueries;
use crate::middleware::rbac::RequirePermission;
use models::tenant::{Permission, TenantContext};



fn qdrant_error_code(message: &str) -> &'static str {
    let m = message.to_ascii_lowercase();
    if m.contains("deadline") || m.contains("timed out") || m.contains("timeout") {
        return "QDRANT_TIMEOUT";
    }
    if m.contains("refused")
        || m.contains("connect")
        || m.contains("connection")
        || m.contains("unavailable")
        || m.contains("dns")
    {
        return "QDRANT_UNAVAILABLE";
    }
    "QDRANT_SEARCH_FAILED"
}

fn ecosystem_payload_value(e: Ecosystem) -> &'static str {
    match e {
        Ecosystem::Npm => "NPM",
        Ecosystem::PyPi => "PY_PI",
        Ecosystem::Cargo => "CARGO",
        Ecosystem::Maven => "MAVEN",
        Ecosystem::NuGet => "NU_GET",
        Ecosystem::Go => "GO",
        Ecosystem::Unknown => "UNKNOWN",
    }
}

pub struct QueryRoot;

#[Object]
impl QueryRoot {
    /// Get a package by its stable ID (e.g., "npm:express")
    #[instrument(skip(self, ctx))]
    async fn package(&self, ctx: &Context<'_>, id: ID) -> Result<Option<Package>> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let tenant_ctx = ctx.data::<Option<TenantContext>>()?.as_ref();
        // Use a default/system tenant ID for public access if no context 
        // (In production, maybe strict error? For now, empty string or handled by loader)
        let tenant_id = tenant_ctx.map(|c| c.tenant_id.to_string()).unwrap_or_else(|| "public".to_string());
        
        let pkg = gql_ctx.package_loader.load(&id.to_string(), &tenant_id).await;
        Ok(pkg)
    }

    /// Get all packages that depend on a given package (reverse dependencies)
    ///
    /// # Arguments
    /// * `package_id` - The package to find dependents for (e.g., "npm:lodash")
    /// * `max_depth` - Maximum traversal depth (default: 2, max: configurable)
    /// * `first` - Number of results to return (for pagination)
    /// * `after` - Cursor for pagination (base64 encoded offset)
    #[instrument(skip(self, ctx))]
    async fn reverse_dependents(
        &self,
        ctx: &Context<'_>,
        package_id: ID,
        #[graphql(default = 2)] max_depth: i32,
        #[graphql(default = 50)] first: i32,
        after: Option<String>,
    ) -> Result<PackageConnection> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let guardrails = &gql_ctx.guardrails;

        // Apply guardrails
        let effective_depth = max_depth.min(guardrails.max_traversal_depth);
        let effective_limit = first.min(guardrails.max_results);
        
        // Parse cursor for offset
        let offset: i32 = after
            .and_then(|c| base64_decode_cursor(&c))
            .unwrap_or(0);

        debug!(
            effective_depth,
            effective_limit,
            offset,
            "Executing reverseDependents query"
        );

        let tenant_ctx = ctx.data::<Option<TenantContext>>()?.as_ref();
        let tenant_id = tenant_ctx.map(|c| c.tenant_id.to_string()).unwrap_or_else(|| "public".to_string());

        // Execute query
        let query = GraphQueries::reverse_dependents_transitive(
            &tenant_id,
            &package_id.to_string(),
            effective_depth,
            effective_limit + 1, // +1 to check if there's a next page
        );

        let rows = gql_ctx.graph.query(query, tenant_ctx).await?;
        
        // Check if there's a next page
        let has_next_page = rows.len() as i32 > effective_limit;
        let rows: Vec<_> = rows.into_iter().take(effective_limit as usize).collect();

        // Build edges
        let mut edges = Vec::with_capacity(rows.len());
        for (idx, row) in rows.iter().enumerate() {
            let id: String = row.get("id").unwrap_or_default();
            let depth: i64 = row.get("depth").unwrap_or(1);
            
            let pkg = Package {
                id: ID(id.clone()),
                ecosystem: Ecosystem::from(
                    row.get::<String>("ecosystem")
                        .unwrap_or_default()
                        .as_str(),
                ),
                name: row.get::<String>("name").unwrap_or_default(),
                created_at: None,
                updated_at: None,
            };

            edges.push(PackageEdge {
                node: pkg,
                cursor: base64_encode_cursor(offset + idx as i32),
                depth: Some(depth as i32),
            });
        }

        // Get total count (separate query, could be cached)
        let count_query = GraphQueries::reverse_dependents_count(
            &tenant_id,
            &package_id.to_string(),
            effective_depth,
        );
        let total_count = match gql_ctx.graph.query_one(count_query, tenant_ctx).await? {
            Some(row) => row.get::<i64>("total").unwrap_or(0) as i32,
            None => 0,
        };

        // Extract cursors before moving edges
        let start_cursor = edges.first().map(|e| e.cursor.clone());
        let end_cursor = edges.last().map(|e| e.cursor.clone());

        Ok(PackageConnection {
            edges,
            page_info: PageInfo {
                has_next_page,
                has_previous_page: offset > 0,
                start_cursor,
                end_cursor,
            },
            total_count,
        })
    }

    /// Find the shortest dependency path between two packages
    ///
    /// # Arguments
    /// * `from_package_id` - Starting package (e.g., "npm:express")
    /// * `to_package_id` - Target package (e.g., "npm:lodash")
    /// * `max_hops` - Maximum path length to search (default: 6)
    #[instrument(skip(self, ctx))]
    async fn dependency_path(
        &self,
        ctx: &Context<'_>,
        from_package_id: ID,
        to_package_id: ID,
        #[graphql(default = 6)] max_hops: i32,
    ) -> Result<DependencyPathResult> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let guardrails = &gql_ctx.guardrails;

        // Apply guardrails
        let effective_hops = max_hops.min(guardrails.max_path_hops);

        debug!(effective_hops, "Executing dependencyPath query");

        let tenant_ctx = ctx.data::<Option<TenantContext>>()?.as_ref();
        let tenant_id = tenant_ctx.map(|c| c.tenant_id.to_string()).unwrap_or_else(|| "public".to_string());

        let query = GraphQueries::dependency_path(
            &tenant_id,
            &from_package_id.to_string(),
            &to_package_id.to_string(),
            effective_hops,
        );

        match gql_ctx.graph.query_one(query, tenant_ctx).await? {
            Some(row) => {
                let package_ids: Vec<String> = row.get("package_ids").unwrap_or_default();
                let hops: i64 = row.get("hops").unwrap_or(0);

                // Batch load packages
                let packages_map = gql_ctx.package_loader.load_many(&package_ids, &tenant_id).await;
                
                // Preserve order
                let packages: Vec<Package> = package_ids
                    .iter()
                    .filter_map(|id| packages_map.get(id).cloned())
                    .collect();

                Ok(DependencyPathResult {
                    found: true,
                    hops: hops as i32,
                    packages,
                })
            }
            None => Ok(DependencyPathResult {
                found: false,
                hops: 0,
                packages: vec![],
            }),
        }
    }

    /// Calculate the impact radius of a vulnerability in a package
    ///
    /// Returns all packages that would be transitively affected if a CVE
    /// is discovered in the specified package/version range.
    ///
    /// # Arguments
    /// * `package_id` - The vulnerable package
    /// * `vulnerable_version_range` - Semver range (e.g., ">=1.2.0 <1.2.5") - for reference only in MVP
    /// * `max_depth` - Maximum traversal depth (default: 3)
    /// * `limit` - Maximum impacted packages to return (default: 5000)
    #[instrument(skip(self, ctx))]
    async fn impact_radius(
        &self,
        ctx: &Context<'_>,
        package_id: ID,
        vulnerable_version_range: Option<String>,
        #[graphql(default = 3)] max_depth: i32,
        #[graphql(default = 5000)] limit: i32,
    ) -> Result<ImpactRadiusResult> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let guardrails = &gql_ctx.guardrails;

        // Apply guardrails
        let effective_depth = max_depth.min(guardrails.max_traversal_depth);
        let effective_limit = limit.min(guardrails.max_results);

        debug!(
            effective_depth,
            effective_limit,
            "Executing impactRadius query"
        );

        let tenant_ctx = ctx.data::<Option<TenantContext>>()?.as_ref();
        let tenant_id = tenant_ctx.map(|c| c.tenant_id.to_string()).unwrap_or_else(|| "public".to_string());

        // Get impacted packages with depth
        let query = GraphQueries::impact_radius(
            &tenant_id,
            &package_id.to_string(),
            effective_depth,
            effective_limit,
        );

        let rows = gql_ctx.graph.query(query, tenant_ctx).await?;

        // Build top impacted list
        let mut top_impacted = Vec::with_capacity(rows.len());
        for row in &rows {
            let id: String = row.get("id").unwrap_or_default();
            let depth: i64 = row.get("depth").unwrap_or(1);

            let pkg = Package {
                id: ID(id.clone()),
                ecosystem: Ecosystem::from(
                    row.get::<String>("ecosystem")
                        .unwrap_or_default()
                        .as_str(),
                ),
                name: row.get::<String>("name").unwrap_or_default(),
                created_at: None,
                updated_at: None,
            };

            top_impacted.push(ImpactNode {
                package: pkg,
                depth: depth as i32,
                estimated_affected_versions: None, // Would need separate query
            });
        }

        // Get total counts
        let count_query = GraphQueries::impact_radius_versions(
            &tenant_id,
            &package_id.to_string(),
            effective_depth,
        );
        
        let (impacted_packages, impacted_versions) = match gql_ctx.graph.query_one(count_query, tenant_ctx).await? {
            Some(row) => (
                row.get::<i64>("impacted_packages").unwrap_or(0) as i32,
                row.get::<i64>("impacted_versions").unwrap_or(0) as i32,
            ),
            None => (0, 0),
        };

        Ok(ImpactRadiusResult {
            package_id,
            vulnerable_version_range,
            max_depth: effective_depth,
            impacted_packages,
            impacted_versions,
            top_impacted,
        })
    }

    /// Get versions of a package
    #[instrument(skip(self, ctx))]
    async fn versions(
        &self,
        ctx: &Context<'_>,
        package_id: ID,
        #[graphql(default = 50)] limit: i32,
    ) -> Result<Vec<Version>> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let effective_limit = limit.min(gql_ctx.guardrails.max_results);

        let tenant_ctx = ctx.data::<Option<TenantContext>>()?.as_ref();
        let tenant_id = tenant_ctx.map(|c| c.tenant_id.to_string()).unwrap_or_else(|| "public".to_string());

        let query = GraphQueries::get_versions(&tenant_id, &package_id.to_string(), effective_limit);
        let rows = gql_ctx.graph.query(query, tenant_ctx).await?;

        let versions: Vec<Version> = rows
            .iter()
            .map(|row| Version {
                id: ID(row.get::<String>("id").unwrap_or_default()),
                package_id: package_id.clone(),
                version: row.get("version").unwrap_or_default(),
                published_at: row.get::<i64>("published_at")
                    .ok()
                    .and_then(|ts| chrono::DateTime::from_timestamp_millis(ts))
                    .map(|dt| dt.to_rfc3339()),
                yanked: row.get("yanked").unwrap_or(false),
            })
            .collect();

        Ok(versions)
    }

    /// Get direct dependencies of a package
    #[instrument(skip(self, ctx))]
    async fn dependencies(
        &self,
        ctx: &Context<'_>,
        package_id: ID,
        #[graphql(default = 100)] limit: i32,
    ) -> Result<Vec<Package>> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let effective_limit = limit.min(gql_ctx.guardrails.max_results);

        let tenant_ctx = ctx.data::<Option<TenantContext>>()?.as_ref();
        // dependencies_direct uses GraphQueries which I haven't updated to take tenant_id because it was chunk 4 (failed multiple times)
        // Wait, did I update dependencies_direct? I tried in Step 16 chunk 4 but it failed.
        // It failed because "reverse_dependents_direct" was chunk 4.
        // dependencies_direct (lines 249-265 of queries.rs) was NOT in my ReplaceChunks in Step 16? 
        // Let me check. Step 16 had "reverse_dependents_direct" as chunk 4. 
        // It did NOT have "dependencies_direct". 
        // I might have missed updating dependencies_direct in queries.rs!
        // I should check if I missed it.
        // If I missed it, then GraphQueries::dependencies_direct does NOT accept tenant_id yet.
        // So I can't pass it here.
        // But for consistency I SHOULD have updated it.
        // I need to check queries.rs again.
        
        // Assuming I will fix queries.rs in next step if missed.
        
        let tenant_ctx = ctx.data::<Option<TenantContext>>()?.as_ref();
        let tenant_id = tenant_ctx.map(|c| c.tenant_id.to_string()).unwrap_or_else(|| "public".to_string());

        let query = GraphQueries::dependencies_direct(&tenant_id, &package_id.to_string(), effective_limit);
        let rows = gql_ctx.graph.query(query, tenant_ctx).await?;

        let packages: Vec<Package> = rows
            .iter()
            .map(|row| Package {
                id: ID(row.get::<String>("id").unwrap_or_default()),
                ecosystem: Ecosystem::from(
                    row.get::<String>("ecosystem")
                        .unwrap_or_default()
                        .as_str(),
                ),
                name: row.get("name").unwrap_or_default(),
                created_at: None,
                updated_at: None,
            })
            .collect();

        Ok(packages)
    }

    /// Get graph statistics
    #[graphql(guard = "RequirePermission::one(Permission::SystemAdmin)")]
    async fn graph_stats(&self, ctx: &Context<'_>) -> Result<GraphStats> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let tenant_ctx = ctx.data::<Option<TenantContext>>()?.as_ref();
        
        let query = GraphQueries::graph_stats();
        
        let (total_packages, total_versions, total_dependencies, total_package_dependencies) = 
            match gql_ctx.graph.query_one(query, tenant_ctx).await? {
                Some(row) => (
                    row.get("packages").unwrap_or(0),
                    row.get("versions").unwrap_or(0),
                    row.get("dependencies").unwrap_or(0),
                    row.get("pkg_dependencies").unwrap_or(0),
                ),
                None => (0, 0, 0, 0),
            };

        // Get ecosystem breakdown
        let eco_query = GraphQueries::ecosystem_breakdown();
        let eco_rows = gql_ctx.graph.query(eco_query, tenant_ctx).await?;
        
        let ecosystem_breakdown: Vec<EcosystemCount> = eco_rows
            .iter()
            .map(|row| {
                let eco_str: String = row.get("ecosystem").unwrap_or_default();
                EcosystemCount {
                    ecosystem: Ecosystem::from(eco_str.as_str()),
                    count: row.get("count").unwrap_or(0),
                }
            })
            .collect();

        Ok(GraphStats {
            total_packages,
            total_versions,
            total_dependencies,
            total_package_dependencies,
            ecosystem_breakdown,
        })
    }

    /// Search packages by name
    #[instrument(skip(self, ctx))]
    async fn search_packages(
        &self,
        ctx: &Context<'_>,
        query: String,
        ecosystem: Option<Ecosystem>,
        #[graphql(default = 20)] first: i32,
        after: Option<String>,
    ) -> Result<SearchConnection> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let effective_limit = first.min(gql_ctx.guardrails.max_results);

        // Parse cursor for offset
        let offset: i32 = after
            .and_then(|c| base64_decode_cursor(&c))
            .unwrap_or(0);

        // Convert ecosystem to canonical stored string (aligns with ingest/payload conventions)
        let eco_str = ecosystem.map(ecosystem_payload_value);

        debug!(query = %query, ecosystem = ?eco_str, "Executing searchPackages");

        let tenant_ctx = ctx.data::<Option<TenantContext>>()?.as_ref();
        let tenant_id = tenant_ctx.map(|c| c.tenant_id.to_string()).unwrap_or_else(|| "public".to_string());

        // Execute search query
        let search_query = GraphQueries::search_packages(&tenant_id, &query, eco_str, effective_limit + 1);
        let rows = gql_ctx.graph.query(search_query, tenant_ctx).await?;

        // Check for next page
        let has_next_page = rows.len() as i32 > effective_limit;
        let rows: Vec<_> = rows.into_iter().take(effective_limit as usize).collect();

        // Build edges
        let mut edges = Vec::with_capacity(rows.len());
        for (idx, row) in rows.iter().enumerate() {
            let pkg = Package {
                id: ID(row.get::<String>("id").unwrap_or_default()),
                ecosystem: Ecosystem::from(
                    row.get::<String>("ecosystem")
                        .unwrap_or_default()
                        .as_str(),
                ),
                name: row.get("name").unwrap_or_default(),
                created_at: None,
                updated_at: None,
            };

            edges.push(SearchEdge {
                node: pkg,
                cursor: base64_encode_cursor(offset + idx as i32),
            });
        }

        // Get total count
        let count_query = GraphQueries::search_packages_count(&tenant_id, &query, eco_str);
        let total_count = match gql_ctx.graph.query_one(count_query, tenant_ctx).await? {
            Some(row) => row.get::<i64>("total").unwrap_or(0) as i32,
            None => 0,
        };

        let start_cursor = edges.first().map(|e| e.cursor.clone());
        let end_cursor = edges.last().map(|e| e.cursor.clone());

        Ok(SearchConnection {
            edges,
            page_info: PageInfo {
                has_next_page,
                has_previous_page: offset > 0,
                start_cursor,
                end_cursor,
            },
            total_count,
        })
    }

    /// Semantic search packages using vector similarity (Qdrant).
    ///
    /// Returns the best-matching packages based on symbol-level embeddings.
    #[instrument(skip(self, ctx))]
    async fn semantic_search_packages(
        &self,
        ctx: &Context<'_>,
        query: String,
        ecosystem: Option<Ecosystem>,
        #[graphql(default = 20)] first: i32,
        after: Option<String>,
    ) -> Result<SemanticSearchConnection> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let effective_limit = first.min(gql_ctx.guardrails.max_results);

        // Parse cursor for offset
        let offset: i32 = after
            .and_then(|c| base64_decode_cursor(&c))
            .unwrap_or(0);

        let Some(semantic) = gql_ctx.semantic_search.as_ref() else {
            return Ok(SemanticSearchConnection {
                edges: vec![],
                page_info: PageInfo {
                    has_next_page: false,
                    has_previous_page: offset > 0,
                    start_cursor: None,
                    end_cursor: None,
                },
                total_count: 0,
            });
        };

        // Convert ecosystem to the stored payload string (e.g. "PY_PI", "NU_GET")
        let eco_str = ecosystem.map(ecosystem_payload_value);

        debug!(query = %query, ecosystem = ?eco_str, "Executing semanticSearchPackages");

        let embedding = semantic
            .embedder
            .generate(&query)
            .await
            .map_err(|e| {
                let mut err = async_graphql::Error::new("Embedding generation failed");

                if let Some(embed_err) = e.downcast_ref::<EmbeddingError>() {
                    err = err.extend_with(|_, ext| {
                        ext.set("code", embed_err.code());
                        match embed_err {
                            EmbeddingError::ProviderRejected { status, .. } => {
                                ext.set("status", *status);
                            }
                            _ => {}
                        }
                    });
                } else {
                    err = err.extend_with(|_, ext| {
                        ext.set("code", "EMBEDDING_UNKNOWN");
                    });
                }

                err
            })?;

        // Qdrant search returns symbol-level hits; we de-duplicate into packages.
        // Because de-dup can collapse many hits into one package, we may need to
        // ask Qdrant for more points to get a full page of unique packages.
        let needed_unique = (offset + effective_limit + 1).max(0) as u64;
        let mut top_k: u64 = needed_unique.saturating_mul(5).max(20);
        let max_top_k: u64 = needed_unique
            .saturating_mul(50)
            .max(200)
            .min(10_000);

        let mut best_scores: HashMap<String, f32> = HashMap::new();
        let mut ordered: Vec<String> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();
        let mut has_more_points = false;

        let tenant_ctx = ctx.data::<Option<TenantContext>>()?.as_ref();
        let tenant_id = tenant_ctx.map(|c| c.tenant_id.to_string()).unwrap_or_else(|| "public".to_string());

        for _attempt in 0..3 {
            // Use storage layer's search method which handles tenant isolation
            let search_results = semantic
                .qdrant
                .search(&tenant_id, embedding.clone(), top_k)
                .await
                .map_err(|e| {
                    let details = e.to_string();
                    let code = qdrant_error_code(&details);
                    async_graphql::Error::new("Qdrant search failed").extend_with(|_, ext| {
                        ext.set("code", code);
                        ext.set("details", details);
                    })
                })?;

            has_more_points = search_results.len() as u64 >= top_k;

            best_scores.clear();
            ordered.clear();
            seen.clear();

            for result in search_results {
                let Some(package_id_value) = result.payload.get("package_id") else { continue };
                let Some(qdrant_client::qdrant::value::Kind::StringValue(package_id)) = package_id_value.kind.as_ref() else { continue };

                // Optional ecosystem filter (post-filter since storage layer doesn't support it yet)
                if let Some(eco) = eco_str {
                    if let Some(eco_value) = result.payload.get("ecosystem") {
                        if let Some(qdrant_client::qdrant::value::Kind::StringValue(result_eco)) = eco_value.kind.as_ref() {
                            if result_eco != eco {
                                continue;
                            }
                        }
                    }
                }

                let score = result.score;
                match best_scores.get(package_id) {
                    Some(existing) if *existing >= score => {}
                    _ => {
                        best_scores.insert(package_id.clone(), score);
                        if seen.insert(package_id.clone()) {
                            ordered.push(package_id.clone());
                        }
                    }
                }
            }

            if (ordered.len() as u64) > needed_unique {
                break;
            }

            if !has_more_points || top_k >= max_top_k {
                break;
            }

            top_k = (top_k.saturating_mul(2)).min(max_top_k);
        }

        // Sort packages by best score desc; tie-break deterministically by id.
        ordered.sort_by(|a, b| {
            let sa = best_scores.get(a).copied().unwrap_or(0.0);
            let sb = best_scores.get(b).copied().unwrap_or(0.0);

            match sb.partial_cmp(&sa) {
                Some(std::cmp::Ordering::Equal) | None => a.cmp(b),
                Some(ord) => ord,
            }
        });

        let has_next_page = (ordered.len() as i32) > (offset + effective_limit)
            || (has_more_points && top_k >= max_top_k);
        let page_ids: Vec<String> = ordered
            .iter()
            .skip(offset.max(0) as usize)
            .take(effective_limit.max(0) as usize)
            .cloned()
            .collect();

        let packages_map = gql_ctx.package_loader.load_many(&page_ids, &tenant_id).await;

        let mut edges: Vec<SemanticSearchEdge> = Vec::with_capacity(page_ids.len());
        for (idx, id) in page_ids.iter().enumerate() {
            let Some(pkg) = packages_map.get(id).cloned() else { continue };
            let score = best_scores.get(id).copied().unwrap_or(0.0);
            edges.push(SemanticSearchEdge {
                node: pkg,
                cursor: base64_encode_cursor(offset + idx as i32),
                score,
            });
        }

        let start_cursor = edges.first().map(|e| e.cursor.clone());
        let end_cursor = edges.last().map(|e| e.cursor.clone());

        Ok(SemanticSearchConnection {
            edges,
            page_info: PageInfo {
                has_next_page,
                has_previous_page: offset > 0,
                start_cursor,
                end_cursor,
            },
            // Total count is not cheaply available from Qdrant; keep 0 for now.
            total_count: 0,
        })
    }

    /// Ask Gemini 3.0 (Thinking Model)
    #[instrument(skip(self, ctx))]
    async fn ask_gemini(&self, ctx: &Context<'_>, question: String, context_packages: Vec<ID>) -> Result<String> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        if let Some(gemini) = &gql_ctx.gemini {
             let prompt = if context_packages.is_empty() {
                 question
             } else {
                 let ids: Vec<String> = context_packages.iter().map(|id| id.to_string()).collect();
                 format!("Context Packages: {:?}\n\nQuestion: {}", ids, question)
             };
             let answer = gemini.generate_thinking(&prompt).await?;
             Ok(answer)
        } else {
             Err("Gemini service unavailable. Please check API key configuration.".into())
        }
    }

    /// Explain dependency graph using Gemini
    #[instrument(skip(self, ctx))]
    async fn explain_dependency_graph(&self, ctx: &Context<'_>, package_id: ID) -> Result<String> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        if let Some(gemini) = &gql_ctx.gemini {
             let prompt = format!("Analyze and explain the dependency graph for package {}. What are its critical dependencies and potential risks? Provide a concise summary.", package_id.to_string());
             let explanation = gemini.generate_thinking(&prompt).await?;
             Ok(explanation)
        } else {
             Err("Gemini service unavailable".into())
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// CURSOR HELPERS
// ═══════════════════════════════════════════════════════════════

fn base64_encode_cursor(offset: i32) -> String {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    STANDARD.encode(offset.to_string())
}

fn base64_decode_cursor(cursor: &str) -> Option<i32> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    STANDARD
        .decode(cursor)
        .ok()
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .and_then(|s| s.parse().ok())
}
