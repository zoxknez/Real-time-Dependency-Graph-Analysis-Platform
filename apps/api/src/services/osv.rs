use anyhow::{Result, anyhow};
use reqwest::Client;
use serde::{Deserialize, Serialize};

const OSV_API_BASE: &str = "https://api.osv.dev";

#[derive(Debug, Clone, Serialize)]
pub struct OsvPackage {
    pub name: String,
    pub ecosystem: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub purl: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct OsvQueryRequest {
    pub package: OsvPackage,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub page_token: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OsvQueryResponse {
    #[serde(default)]
    pub vulns: Vec<OsvVulnerability>,
    #[serde(default)]
    pub next_page_token: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OsvVulnerability {
    pub id: String,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub details: Option<String>,
    #[serde(default)]
    pub published: Option<String>,
    #[serde(default)]
    pub modified: Option<String>,
    #[serde(default)]
    pub aliases: Option<Vec<String>>,
    #[serde(default)]
    pub references: Option<Vec<OsvReference>>,
    #[serde(default)]
    pub affected: Option<Vec<OsvAffected>>,
    #[serde(default)]
    pub severity: Option<Vec<OsvSeverity>>,
    #[serde(default)]
    pub database_specific: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OsvReference {
    #[serde(default)]
    #[allow(dead_code)]
    pub r#type: Option<String>,
    pub url: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OsvAffected {
    pub package: OsvPackageInfo,
    #[serde(default)]
    pub versions: Option<Vec<String>>,
    #[serde(default)]
    pub ecosystem_specific: Option<OsvEcosystemSpecific>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OsvPackageInfo {
    pub name: String,
    pub ecosystem: String,
    #[serde(default)]
    #[allow(dead_code)]
    pub purl: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OsvEcosystemSpecific {
    #[serde(default)]
    pub severity: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OsvSeverity {
    #[serde(rename = "type")]
    pub severity_type: String,
    pub score: String,
}

pub async fn query_vulnerabilities(
    ecosystem: &str,
    name: &str,
    version: Option<&str>,
) -> Result<Vec<OsvVulnerability>> {
    let client = Client::new();
    let mut page_token: Option<String> = None;
    let mut all_vulns: Vec<OsvVulnerability> = Vec::new();

    loop {
        let request = OsvQueryRequest {
            package: OsvPackage {
                name: name.to_string(),
                ecosystem: ecosystem.to_string(),
                purl: None,
            },
            version: version.map(|v| v.to_string()),
            page_token: page_token.clone(),
        };

        let response = client
            .post(format!("{}/v1/query", OSV_API_BASE))
            .json(&request)
            .send()
            .await?
            .error_for_status()?;

        let data: OsvQueryResponse = response.json().await?;
        if !data.vulns.is_empty() {
            all_vulns.extend(data.vulns);
        }

        if let Some(next) = data.next_page_token {
            page_token = Some(next);
        } else {
            break;
        }
    }

    Ok(all_vulns)
}

pub async fn get_vulnerability(id: &str) -> Result<Option<OsvVulnerability>> {
    let client = Client::new();
    let url = format!("{}/v1/vulns/{}", OSV_API_BASE, id);
    let response = client.get(url).send().await?;
    if response.status().as_u16() == 404 {
        return Ok(None);
    }
    let vuln = response.error_for_status()?.json::<OsvVulnerability>().await?;
    Ok(Some(vuln))
}

pub fn normalize_ecosystem(ecosystem: &str) -> Option<&'static str> {
    match ecosystem.to_ascii_lowercase().as_str() {
        "npm" => Some("npm"),
        "pypi" => Some("PyPI"),
        "cargo" | "crates" | "crates.io" => Some("crates.io"),
        "maven" => Some("Maven"),
        "nuget" => Some("NuGet"),
        "go" | "golang" => Some("Go"),
        _ => None,
    }
}

pub fn parse_package_id(package_id: &str) -> (Option<String>, Option<String>, Option<String>) {
    let parts: Vec<&str> = package_id.split('/').collect();
    if parts.len() >= 2 {
        let ecosystem = Some(parts[0].to_string());
        let name = Some(parts[1].to_string());
        let version = if parts.len() >= 3 { Some(parts[2].to_string()) } else { None };
        return (ecosystem, name, version);
    }
    if let Some((eco, rest)) = package_id.split_once(':') {
        return (Some(eco.to_string()), Some(rest.to_string()), None);
    }
    (None, None, None)
}

pub fn summarize_severity(vuln: &OsvVulnerability) -> String {
    if let Some(affected) = vuln.affected.as_ref() {
        for item in affected {
            if let Some(sev) = item.ecosystem_specific.as_ref().and_then(|s| s.severity.as_ref()) {
                return sev.to_ascii_lowercase();
            }
        }
    }
    if let Some(db) = vuln.database_specific.as_ref() {
        if let Some(sev) = db.get("severity").and_then(|v| v.as_str()) {
            return sev.to_ascii_lowercase();
        }
    }
    if let Some(severities) = vuln.severity.as_ref() {
        for s in severities {
            if s.severity_type.contains("CVSS") {
                if let Ok(score) = s.score.parse::<f64>() {
                    return cvss_score_to_label(score);
                }
            }
        }
    }
    "unknown".to_string()
}

pub fn cvss_score_to_label(score: f64) -> String {
    if score >= 9.0 {
        "critical".to_string()
    } else if score >= 7.0 {
        "high".to_string()
    } else if score >= 4.0 {
        "medium".to_string()
    } else if score > 0.0 {
        "low".to_string()
    } else {
        "unknown".to_string()
    }
}

pub fn primary_identifier(vuln: &OsvVulnerability) -> String {
    if let Some(aliases) = vuln.aliases.as_ref() {
        if let Some(cve) = aliases.iter().find(|a| a.starts_with("CVE-")) {
            return cve.to_string();
        }
        if let Some(first) = aliases.first() {
            return first.to_string();
        }
    }
    vuln.id.clone()
}

pub fn ensure_ecosystem(ecosystem: Option<String>) -> Result<String> {
    let Some(ecosystem) = ecosystem else {
        return Err(anyhow!("Missing ecosystem"));
    };
    let normalized = normalize_ecosystem(&ecosystem).unwrap_or(ecosystem.as_str());
    Ok(normalized.to_string())
}
