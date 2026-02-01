//! Security agent tool executor shared by GraphQL and SSE endpoints.

use anyhow::Result;
use serde_json::{json, Value};

use crate::graph::{GraphClient, GraphQueries};
use crate::services::osv;
use models::tenant::TenantContext;

/// Execute a security agent tool call using real graph queries where available.
pub async fn execute_security_agent_tool(
    graph: GraphClient,
    tenant_ctx: Option<TenantContext>,
    tenant_id: String,
    max_results: i32,
    name: String,
    args: Value,
) -> Result<Value> {
    match name.as_str() {
        "search_packages" => {
            let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
            let ecosystem = args.get("ecosystem").and_then(|v| v.as_str());
            let limit = args.get("limit").and_then(|v| v.as_i64()).unwrap_or(20) as i32;
            let effective_limit = limit.min(max_results);

            let query_stmt = GraphQueries::search_packages(
                &tenant_id,
                query,
                ecosystem,
                effective_limit,
            );
            let rows = graph.query(query_stmt, tenant_ctx.as_ref()).await?;
            let packages: Vec<Value> = rows
                .into_iter()
                .map(|row| {
                    json!({
                        "id": row.get::<String>("id").unwrap_or_default(),
                        "ecosystem": row.get::<String>("ecosystem").unwrap_or_default(),
                        "name": row.get::<String>("name").unwrap_or_default(),
                    })
                })
                .collect();

            let count_query = GraphQueries::search_packages_count(&tenant_id, query, ecosystem);
            let total_count = match graph.query_one(count_query, tenant_ctx.as_ref()).await? {
                Some(row) => row.get::<i64>("total").unwrap_or(0) as i32,
                None => 0,
            };

            Ok(json!({
                "packages": packages,
                "total_count": total_count,
                "limit": effective_limit
            }))
        }

        "get_dependency_path" => {
            let from = args.get("from_package").and_then(|v| v.as_str()).unwrap_or("");
            let to = args.get("to_package").and_then(|v| v.as_str()).unwrap_or("");
            let max_hops = args.get("max_hops").and_then(|v| v.as_i64()).unwrap_or(5) as i32;

            let query_stmt = GraphQueries::dependency_path(&tenant_id, from, to, max_hops);
            let result = graph.query_one(query_stmt, tenant_ctx.as_ref()).await?;

            if let Some(row) = result {
                let package_ids: Vec<String> = row.get("package_ids").unwrap_or_default();
                let hops: i64 = row.get("hops").unwrap_or(0);
                Ok(json!({
                    "found": true,
                    "hops": hops,
                    "path": package_ids,
                }))
            } else {
                Ok(json!({
                    "found": false,
                    "hops": 0,
                    "path": []
                }))
            }
        }

        "get_impact_radius" => {
            let package_id = args.get("package_id").and_then(|v| v.as_str()).unwrap_or("");
            let depth = args.get("depth").and_then(|v| v.as_i64()).unwrap_or(2) as i32;
            let limit = args.get("limit").and_then(|v| v.as_i64()).unwrap_or(50) as i32;
            let effective_limit = limit.min(max_results);

            let query_stmt = GraphQueries::impact_radius(&tenant_id, package_id, depth, effective_limit);
            let rows = graph.query(query_stmt, tenant_ctx.as_ref()).await?;

            let impacted: Vec<Value> = rows
                .into_iter()
                .map(|row| {
                    json!({
                        "id": row.get::<String>("id").unwrap_or_default(),
                        "ecosystem": row.get::<String>("ecosystem").unwrap_or_default(),
                        "name": row.get::<String>("name").unwrap_or_default(),
                        "depth": row.get::<i64>("depth").unwrap_or(1),
                    })
                })
                .collect();

            Ok(json!({
                "package_id": package_id,
                "depth": depth,
                "impacted_packages": impacted.len(),
                "top_impacted": impacted
            }))
        }

        "get_vulnerabilities" => {
            let package_id = args.get("package_id").and_then(|v| v.as_str()).unwrap_or("");
            let severity_filter = args.get("severity_filter").and_then(|v| v.as_str()).map(|s| s.to_ascii_lowercase());

            let (eco_raw, name_raw, version_raw) = osv::parse_package_id(package_id);
            let ecosystem = if let Some(eco) = args.get("ecosystem").and_then(|v| v.as_str()) {
                osv::ensure_ecosystem(Some(eco.to_string()))?
            } else {
                osv::ensure_ecosystem(eco_raw)?
            };
            let name = args
                .get("package_name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or(name_raw)
                .unwrap_or_default();
            let version = args
                .get("version")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or(version_raw);

            let vulns = if name.is_empty() {
                vec![]
            } else {
                osv::query_vulnerabilities(&ecosystem, &name, version.as_deref()).await?
            };

            let vulnerabilities: Vec<Value> = vulns
                .into_iter()
                .filter_map(|v| {
                    let severity = osv::summarize_severity(&v);
                    if let Some(filter) = severity_filter.as_ref() {
                        if &severity != filter {
                            return None;
                        }
                    }

                    let references: Vec<String> = v
                        .references
                        .unwrap_or_default()
                        .into_iter()
                        .map(|r| r.url)
                        .collect();

                    Some(json!({
                        "cve_id": osv::primary_identifier(&v),
                        "severity": severity,
                        "description": v.summary.or(v.details).unwrap_or_default(),
                        "published_at": v.published,
                        "references": references,
                    }))
                })
                .collect();

            Ok(json!({
                "package_id": package_id,
                "package_name": name,
                "ecosystem": ecosystem,
                "version": version,
                "vulnerabilities": vulnerabilities,
                "severity_filter": severity_filter
            }))
        }

        "generate_sbom" => {
            let package_id = args.get("package_id").and_then(|v| v.as_str()).unwrap_or("");
            let format = args.get("format").and_then(|v| v.as_str()).unwrap_or("spdx");
            let query_stmt = GraphQueries::dependencies_direct(&tenant_id, package_id, max_results);
            let rows = graph.query(query_stmt, tenant_ctx.as_ref()).await?;
            let components: Vec<Value> = rows
                .into_iter()
                .map(|row| {
                    json!({
                        "id": row.get::<String>("id").unwrap_or_default(),
                        "ecosystem": row.get::<String>("ecosystem").unwrap_or_default(),
                        "name": row.get::<String>("name").unwrap_or_default(),
                    })
                })
                .collect();

            Ok(json!({
                "package_id": package_id,
                "format": format,
                "component_count": components.len(),
                "components": components,
                "generated_at": chrono::Utc::now().to_rfc3339(),
                "sbom_url": format!("/api/sbom/{}/{}", package_id, format)
            }))
        }

        "evaluate_policy" => {
            let package_id = args.get("package_id").and_then(|v| v.as_str()).unwrap_or("");
            let policy = args.get("policy_name").and_then(|v| v.as_str()).unwrap_or("standard");
            let (eco_raw, name_raw, version_raw) = osv::parse_package_id(package_id);
            let ecosystem = osv::ensure_ecosystem(eco_raw)?;
            let name = name_raw.unwrap_or_default();
            let vulns = if name.is_empty() {
                vec![]
            } else {
                osv::query_vulnerabilities(&ecosystem, &name, version_raw.as_deref()).await?
            };

            let mut critical = 0;
            let mut high = 0;
            let mut medium = 0;
            let mut low = 0;

            for v in &vulns {
                match osv::summarize_severity(v).as_str() {
                    "critical" => critical += 1,
                    "high" => high += 1,
                    "medium" => medium += 1,
                    "low" => low += 1,
                    _ => {}
                }
            }

            let mut violations: Vec<Value> = Vec::new();
            if critical > 0 {
                violations.push(json!({
                    "rule": "max_critical_vulns",
                    "message": format!("Package has {} critical vulnerabilities (limit: 0)", critical),
                    "severity": "critical"
                }));
            }
            if high > 5 {
                violations.push(json!({
                    "rule": "max_high_vulns",
                    "message": format!("Package has {} high vulnerabilities (limit: 5)", high),
                    "severity": "high"
                }));
            }

            let score_penalty = (critical * 20 + high * 10 + medium * 5 + low).min(100);
            let compliance_score = (100 - score_penalty) as i32;
            let passed = violations.is_empty();

            Ok(json!({
                "package_id": package_id,
                "policy": policy,
                "passed": passed,
                "violations": violations,
                "compliance_score": compliance_score,
                "severity_counts": {
                    "critical": critical,
                    "high": high,
                    "medium": medium,
                    "low": low
                }
            }))
        }

        "get_scorecard" => {
            let package_id = args.get("package_id").and_then(|v| v.as_str()).unwrap_or("");

            Ok(json!({
                "package_id": package_id,
                "aggregate_score": 7.4,
                "checks": {
                    "code_review": 8,
                    "maintained": 10,
                    "vulnerabilities": 6,
                    "branch_protection": 7,
                    "signed_releases": 5,
                    "security_policy": 9,
                    "pinned_dependencies": 6,
                    "token_permissions": 8
                },
                "last_analyzed": "2024-01-20T10:30:00Z"
            }))
        }

        "get_license_info" => {
            let package_id = args.get("package_id").and_then(|v| v.as_str()).unwrap_or("");

            Ok(json!({
                "package_id": package_id,
                "license": "MIT",
                "spdx_id": "MIT",
                "osi_approved": true,
                "copyleft": false,
                "commercial_use": true,
                "patent_grant": false
            }))
        }

        _ => Ok(json!({
            "error": format!("Unknown tool: {}", name)
        })),
    }
}
