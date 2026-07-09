//! Security agent tool executor shared by GraphQL and SSE endpoints.

use anyhow::Result;
use serde_json::{Value, json};

use crate::graph::{GraphClient, GraphQueries};
use crate::services::package_metadata::PackageMetadata;
use crate::services::{osv, package_metadata, scorecard};
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

            let query_stmt =
                GraphQueries::search_packages(&tenant_id, query, ecosystem, effective_limit);
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
            let from = args
                .get("from_package")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let to = args
                .get("to_package")
                .and_then(|v| v.as_str())
                .unwrap_or("");
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
            let package_id = args
                .get("package_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let depth = args.get("depth").and_then(|v| v.as_i64()).unwrap_or(2) as i32;
            let limit = args.get("limit").and_then(|v| v.as_i64()).unwrap_or(50) as i32;
            let effective_limit = limit.min(max_results);

            let query_stmt =
                GraphQueries::impact_radius(&tenant_id, package_id, depth, effective_limit);
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

            let summary_query = GraphQueries::impact_radius_summary(&tenant_id, package_id, depth);
            let (total_impacted, direct_impacted, transitive_impacted) =
                match graph.query_one(summary_query, tenant_ctx.as_ref()).await? {
                    Some(row) => (
                        row.get::<i64>("impacted_packages").unwrap_or(0),
                        row.get::<i64>("direct_impacted_packages").unwrap_or(0),
                        row.get::<i64>("transitive_impacted_packages").unwrap_or(0),
                    ),
                    None => (impacted.len() as i64, 0, 0),
                };

            let bucket_query =
                GraphQueries::impact_radius_depth_buckets(&tenant_id, package_id, depth);
            let depth_buckets: Vec<Value> = graph
                .query(bucket_query, tenant_ctx.as_ref())
                .await?
                .into_iter()
                .map(|row| {
                    json!({
                        "depth": row.get::<i64>("depth").unwrap_or(0),
                        "package_count": row.get::<i64>("package_count").unwrap_or(0),
                    })
                })
                .collect();

            Ok(json!({
                "package_id": package_id,
                "depth": depth,
                "impacted_packages": total_impacted,
                "direct_impacted_packages": direct_impacted,
                "transitive_impacted_packages": transitive_impacted,
                "depth_buckets": depth_buckets,
                "top_impacted": impacted
            }))
        }

        "get_vulnerabilities" => {
            let package_id = args
                .get("package_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let severity_filter = args
                .get("severity_filter")
                .and_then(|v| v.as_str())
                .map(|s| s.to_ascii_lowercase());

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
                        .clone()
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
            let package_id = args
                .get("package_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let format = args
                .get("format")
                .and_then(|v| v.as_str())
                .unwrap_or("spdx");
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
            let package_id = args
                .get("package_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let policy = args
                .get("policy_name")
                .and_then(|v| v.as_str())
                .unwrap_or("standard");
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
            let package_id = args
                .get("package_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let (eco_raw, name_raw, _) = osv::parse_package_id(package_id);
            let ecosystem_raw = args
                .get("ecosystem")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or(eco_raw);
            let name_raw = args
                .get("package_name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or(name_raw)
                .unwrap_or_default();
            let (name, _) = split_name_version(&name_raw);

            let Some(ecosystem) = ecosystem_raw
                .as_deref()
                .and_then(normalize_metadata_ecosystem)
            else {
                return Ok(json!({
                    "package_id": package_id,
                    "error": "Unsupported or missing ecosystem"
                }));
            };
            if name.is_empty() {
                return Ok(json!({
                    "package_id": package_id,
                    "error": "Missing package name"
                }));
            }

            let repo_url = PackageMetadata::fetch_repository_url(ecosystem, &name).await?;
            let Some(repo_url) = repo_url else {
                return Ok(json!({
                    "package_id": package_id,
                    "package_name": name,
                    "ecosystem": ecosystem,
                    "error": "Repository URL not found for package"
                }));
            };

            let normalized_repo =
                match package_metadata::normalize_repository_for_scorecard(&repo_url) {
                    Ok(r) => r,
                    Err(e) => {
                        return Ok(json!({
                            "package_id": package_id,
                            "package_name": name,
                            "ecosystem": ecosystem,
                            "repository_url": repo_url,
                            "error": e.to_string()
                        }));
                    }
                };

            let result = scorecard::fetch_scorecard(&normalized_repo).await?;

            Ok(json!({
                "package_id": package_id,
                "package_name": name,
                "ecosystem": ecosystem,
                "repository_url": repo_url,
                "target": result.target,
                "aggregate_score": result.aggregate_score,
                "scorecard_version": result.scorecard_version,
                "generated_at": result.generated_at,
                "critical_findings_count": result.critical_findings_count,
                "failed_checks": result.failed_checks
            }))
        }

        "get_license_info" => {
            let package_id = args
                .get("package_id")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let (eco_raw, name_raw, _) = osv::parse_package_id(package_id);
            let ecosystem_raw = args
                .get("ecosystem")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or(eco_raw);
            let name_raw = args
                .get("package_name")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
                .or(name_raw)
                .unwrap_or_default();
            let (name, _) = split_name_version(&name_raw);

            let Some(ecosystem) = ecosystem_raw
                .as_deref()
                .and_then(normalize_metadata_ecosystem)
            else {
                return Ok(json!({
                    "package_id": package_id,
                    "error": "Unsupported or missing ecosystem"
                }));
            };
            if name.is_empty() {
                return Ok(json!({
                    "package_id": package_id,
                    "error": "Missing package name"
                }));
            }

            let license = PackageMetadata::fetch_license(ecosystem, &name).await?;
            let spdx_id = license
                .as_deref()
                .and_then(spdx_from_license)
                .map(|s| s.to_string());

            Ok(json!({
                "package_id": package_id,
                "package_name": name,
                "ecosystem": ecosystem,
                "license": license,
                "spdx_id": spdx_id,
                "osi_approved": null,
                "copyleft": null,
                "commercial_use": null,
                "patent_grant": null,
                "source": "registry metadata"
            }))
        }

        _ => Ok(json!({
            "error": format!("Unknown tool: {}", name)
        })),
    }
}

fn normalize_metadata_ecosystem(raw: &str) -> Option<&'static str> {
    match raw.to_ascii_lowercase().as_str() {
        "npm" => Some("npm"),
        "pypi" | "py_pi" => Some("pypi"),
        "cargo" | "crates" | "crates.io" => Some("cargo"),
        _ => None,
    }
}

fn split_name_version(raw: &str) -> (String, Option<String>) {
    if raw.is_empty() {
        return (String::new(), None);
    }
    if raw.starts_with('@') {
        if let Some(idx) = raw.rfind('@') {
            if idx > 0 && idx + 1 < raw.len() {
                return (raw[..idx].to_string(), Some(raw[idx + 1..].to_string()));
            }
        }
        return (raw.to_string(), None);
    }
    if let Some((name, version)) = raw.rsplit_once('@') {
        if !version.is_empty() {
            return (name.to_string(), Some(version.to_string()));
        }
    }
    (raw.to_string(), None)
}

fn spdx_from_license(license: &str) -> Option<&str> {
    let trimmed = license.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.' || c == '+')
    {
        return Some(trimmed);
    }
    None
}
