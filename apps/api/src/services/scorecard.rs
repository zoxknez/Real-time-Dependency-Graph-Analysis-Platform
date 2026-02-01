use anyhow::{Result, anyhow};
use reqwest::Client;
use serde_json::Value;

use crate::gql::types::{
    RiskCategory, RiskLevel, ScorecardCheck, ScorecardCheckType, ScorecardResult,
};

const SCORECARD_API_BASE: &str = "https://api.securityscorecards.dev";

pub async fn fetch_scorecard(target: &str) -> Result<ScorecardResult> {
    let client = Client::new();
    let url = format!("{}/projects/{}", SCORECARD_API_BASE, target);
    let data: Value = client.get(url).send().await?.error_for_status()?.json().await?;

    let aggregate_score = data.get("score").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
    let scorecard_version = data
        .get("scorecard")
        .and_then(|v| v.get("version"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown")
        .to_string();
    let generated_at = data.get("date").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    let commit_sha = data.get("repo").and_then(|v| v.get("commit")).and_then(|v| v.as_str()).map(|s| s.to_string());

    let checks_data = data.get("checks").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    let mut checks: Vec<ScorecardCheck> = Vec::new();

    for check in checks_data {
        let name = check.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown");
        let score = check.get("score").and_then(|v| v.as_f64()).unwrap_or(0.0).round() as i32;
        let reason = check.get("reason").and_then(|v| v.as_str()).unwrap_or("").to_string();
        let documentation_url = check.get("documentation").and_then(|v| v.as_str()).map(|s| s.to_string());
        let details = check.get("details").and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_else(Vec::new);

        let check_type = map_check_type(name).unwrap_or(ScorecardCheckType::Vulnerabilities);
        let risk_category = classify_risk_category(check_type);
        let risk_level = score_to_risk_level(score);

        checks.push(ScorecardCheck {
            check: check_type,
            name: name.to_string(),
            score,
            reason,
            details,
            documentation_url,
            risk_category,
            risk_level,
        });
    }

    if checks.is_empty() {
        return Err(anyhow!("No scorecard checks returned"));
    }

    let holistic_security: Vec<ScorecardCheck> = checks
        .iter()
        .filter(|c| c.risk_category == RiskCategory::HolisticSecurity)
        .cloned()
        .collect();
    let source_risk: Vec<ScorecardCheck> = checks
        .iter()
        .filter(|c| c.risk_category == RiskCategory::SourceRisk)
        .cloned()
        .collect();
    let build_risk: Vec<ScorecardCheck> = checks
        .iter()
        .filter(|c| c.risk_category == RiskCategory::BuildRisk)
        .cloned()
        .collect();

    let failed_checks: Vec<ScorecardCheck> = checks.iter().filter(|c| c.score < 5).cloned().collect();
    let critical_findings_count = failed_checks.iter().filter(|c| matches!(c.risk_level, RiskLevel::Critical)).count() as i32;

    Ok(ScorecardResult {
        target: target.to_string(),
        target_type: "repository".to_string(),
        aggregate_score,
        checks,
        holistic_security,
        source_risk,
        build_risk,
        generated_at,
        scorecard_version,
        commit_sha,
        failed_checks,
        critical_findings_count,
    })
}

fn map_check_type(name: &str) -> Option<ScorecardCheckType> {
    match name {
        "Binary-Artifacts" => Some(ScorecardCheckType::BinaryArtifacts),
        "Branch-Protection" => Some(ScorecardCheckType::BranchProtection),
        "CI-Tests" => Some(ScorecardCheckType::CiTests),
        "CII-Best-Practices" => Some(ScorecardCheckType::CiiBestPractices),
        "Code-Review" => Some(ScorecardCheckType::CodeReview),
        "Contributors" => Some(ScorecardCheckType::Contributors),
        "Dangerous-Workflow" => Some(ScorecardCheckType::DangerousWorkflow),
        "Dependency-Update-Tool" => Some(ScorecardCheckType::DependencyUpdateTool),
        "Fuzzing" => Some(ScorecardCheckType::Fuzzing),
        "License" => Some(ScorecardCheckType::License),
        "Maintained" => Some(ScorecardCheckType::Maintained),
        "Packaging" => Some(ScorecardCheckType::Packaging),
        "Pinned-Dependencies" => Some(ScorecardCheckType::PinnedDependencies),
        "SAST" => Some(ScorecardCheckType::Sast),
        "Security-Policy" => Some(ScorecardCheckType::SecurityPolicy),
        "Signed-Releases" => Some(ScorecardCheckType::SignedReleases),
        "Token-Permissions" => Some(ScorecardCheckType::TokenPermissions),
        "Vulnerabilities" => Some(ScorecardCheckType::Vulnerabilities),
        "Webhooks" => Some(ScorecardCheckType::Webhooks),
        _ => None,
    }
}

fn classify_risk_category(check: ScorecardCheckType) -> RiskCategory {
    match check {
        ScorecardCheckType::Vulnerabilities
        | ScorecardCheckType::SecurityPolicy
        | ScorecardCheckType::License
        | ScorecardCheckType::Sast => RiskCategory::HolisticSecurity,
        ScorecardCheckType::CodeReview
        | ScorecardCheckType::Maintained
        | ScorecardCheckType::Contributors
        | ScorecardCheckType::BranchProtection
        | ScorecardCheckType::Webhooks => RiskCategory::SourceRisk,
        _ => RiskCategory::BuildRisk,
    }
}

fn score_to_risk_level(score: i32) -> RiskLevel {
    if score >= 8 {
        RiskLevel::Low
    } else if score >= 5 {
        RiskLevel::Medium
    } else if score >= 3 {
        RiskLevel::High
    } else {
        RiskLevel::Critical
    }
}
