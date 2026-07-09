use anyhow::{Result, anyhow};
use reqwest::Client;
use serde_json::Value;

pub struct PackageMetadata;

impl PackageMetadata {
    pub async fn fetch_license(ecosystem: &str, name: &str) -> Result<Option<String>> {
        match ecosystem.to_ascii_lowercase().as_str() {
            "npm" => fetch_npm_license(name).await,
            "pypi" | "py_pi" => fetch_pypi_license(name).await,
            "cargo" | "crates" | "crates.io" => fetch_crates_license(name).await,
            _ => Ok(None),
        }
    }

    pub async fn fetch_latest_version(ecosystem: &str, name: &str) -> Result<Option<String>> {
        match ecosystem.to_ascii_lowercase().as_str() {
            "npm" => fetch_npm_latest_version(name).await,
            "pypi" | "py_pi" => fetch_pypi_latest_version(name).await,
            "cargo" | "crates" | "crates.io" => fetch_crates_latest_version(name).await,
            _ => Ok(None),
        }
    }

    pub async fn fetch_repository_url(ecosystem: &str, name: &str) -> Result<Option<String>> {
        match ecosystem.to_ascii_lowercase().as_str() {
            "npm" => fetch_npm_repository(name).await,
            "pypi" | "py_pi" => fetch_pypi_repository(name).await,
            "cargo" | "crates" | "crates.io" => fetch_crates_repository(name).await,
            _ => Ok(None),
        }
    }
}

fn encode_package(name: &str) -> String {
    name.replace('@', "%40").replace('/', "%2F")
}

async fn fetch_npm_license(name: &str) -> Result<Option<String>> {
    let client = Client::new();
    let url = format!("https://registry.npmjs.org/{}", encode_package(name));
    let data: Value = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    if let Some(dist) = data
        .get("dist-tags")
        .and_then(|v| v.get("latest"))
        .and_then(|v| v.as_str())
    {
        if let Some(license) = data
            .get("versions")
            .and_then(|v| v.get(dist))
            .and_then(|v| v.get("license"))
        {
            return Ok(license.as_str().map(|s| s.to_string()).or_else(|| {
                license
                    .get("type")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            }));
        }
    }

    if let Some(license) = data.get("license") {
        return Ok(license.as_str().map(|s| s.to_string()).or_else(|| {
            license
                .get("type")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        }));
    }

    Ok(None)
}

async fn fetch_npm_repository(name: &str) -> Result<Option<String>> {
    let client = Client::new();
    let url = format!("https://registry.npmjs.org/{}", encode_package(name));
    let data: Value = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    if let Some(dist) = data
        .get("dist-tags")
        .and_then(|v| v.get("latest"))
        .and_then(|v| v.as_str())
    {
        if let Some(repo) = data
            .get("versions")
            .and_then(|v| v.get(dist))
            .and_then(|v| v.get("repository"))
        {
            return Ok(extract_repo_url(repo));
        }
    }

    Ok(data.get("repository").and_then(extract_repo_url))
}

async fn fetch_npm_latest_version(name: &str) -> Result<Option<String>> {
    let client = Client::new();
    let url = format!("https://registry.npmjs.org/{}", encode_package(name));
    let data: Value = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(data
        .get("dist-tags")
        .and_then(|v| v.get("latest"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string()))
}

async fn fetch_pypi_license(name: &str) -> Result<Option<String>> {
    let client = Client::new();
    let url = format!("https://pypi.org/pypi/{}/json", name);
    let data: Value = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    if let Some(license) = data
        .get("info")
        .and_then(|v| v.get("license"))
        .and_then(|v| v.as_str())
    {
        if !license.trim().is_empty() {
            return Ok(Some(license.to_string()));
        }
    }

    if let Some(classifiers) = data
        .get("info")
        .and_then(|v| v.get("classifiers"))
        .and_then(|v| v.as_array())
    {
        for classifier in classifiers {
            if let Some(text) = classifier.as_str() {
                if text.starts_with("License :: ") {
                    return Ok(Some(text.replace("License :: ", "")));
                }
            }
        }
    }

    Ok(None)
}

async fn fetch_pypi_repository(name: &str) -> Result<Option<String>> {
    let client = Client::new();
    let url = format!("https://pypi.org/pypi/{}/json", name);
    let data: Value = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    if let Some(project_urls) = data.get("info").and_then(|v| v.get("project_urls")) {
        if let Some(url) = project_urls.get("Source").and_then(|v| v.as_str()) {
            return Ok(Some(url.to_string()));
        }
    }
    if let Some(url) = data
        .get("info")
        .and_then(|v| v.get("home_page"))
        .and_then(|v| v.as_str())
    {
        if !url.is_empty() {
            return Ok(Some(url.to_string()));
        }
    }
    Ok(None)
}

async fn fetch_pypi_latest_version(name: &str) -> Result<Option<String>> {
    let client = Client::new();
    let url = format!("https://pypi.org/pypi/{}/json", name);
    let data: Value = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(data
        .get("info")
        .and_then(|v| v.get("version"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string()))
}

async fn fetch_crates_license(name: &str) -> Result<Option<String>> {
    let client = Client::new();
    let url = format!("https://crates.io/api/v1/crates/{}", name);
    let data: Value = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(data
        .get("crate")
        .and_then(|v| v.get("license"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string()))
}

async fn fetch_crates_repository(name: &str) -> Result<Option<String>> {
    let client = Client::new();
    let url = format!("https://crates.io/api/v1/crates/{}", name);
    let data: Value = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(data
        .get("crate")
        .and_then(|v| v.get("repository"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string()))
}

async fn fetch_crates_latest_version(name: &str) -> Result<Option<String>> {
    let client = Client::new();
    let url = format!("https://crates.io/api/v1/crates/{}", name);
    let data: Value = client
        .get(url)
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    Ok(data
        .get("crate")
        .and_then(|v| v.get("max_version"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string()))
}

fn extract_repo_url(value: &Value) -> Option<String> {
    if let Some(url) = value.as_str() {
        return Some(clean_repo_url(url));
    }
    if let Some(url) = value.get("url").and_then(|v| v.as_str()) {
        return Some(clean_repo_url(url));
    }
    None
}

fn clean_repo_url(url: &str) -> String {
    url.trim_end_matches(".git").replace("git+", "")
}

pub fn normalize_repository_for_scorecard(url: &str) -> Result<String> {
    let lower = url.to_ascii_lowercase();
    if let Some(rest) = lower.strip_prefix("https://github.com/") {
        return Ok(format!("github.com/{}", rest.trim_end_matches('/')));
    }
    if let Some(rest) = lower.strip_prefix("http://github.com/") {
        return Ok(format!("github.com/{}", rest.trim_end_matches('/')));
    }
    if let Some(rest) = lower.strip_prefix("github.com/") {
        return Ok(format!("github.com/{}", rest.trim_end_matches('/')));
    }
    Err(anyhow!("Unsupported repository URL"))
}
