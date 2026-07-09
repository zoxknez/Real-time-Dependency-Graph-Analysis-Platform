use anyhow::{Context, Result, anyhow};
use reqwest::Client;
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::HashSet;
use std::path::PathBuf;
use std::time::Duration;

#[derive(Debug, Clone, Deserialize)]
struct GoldenSet {
    #[serde(default = "default_k")]
    k: usize,
    cases: Vec<GoldenCase>,
}

#[derive(Debug, Clone, Deserialize)]
struct GoldenCase {
    name: Option<String>,
    query: String,
    #[serde(default)]
    ecosystem: Option<String>,
    expected: Vec<String>,
}

fn default_k() -> usize {
    20
}

fn parse_arg_value(args: &[String], key: &str) -> Option<String> {
    args.iter()
        .position(|a| a == key)
        .and_then(|i| args.get(i + 1))
        .cloned()
}

fn parse_arg_f64(args: &[String], key: &str) -> Option<f64> {
    parse_arg_value(args, key).and_then(|v| v.parse::<f64>().ok())
}

fn parse_arg_usize(args: &[String], key: &str) -> Option<usize> {
    parse_arg_value(args, key).and_then(|v| v.parse::<usize>().ok())
}

#[tokio::main]
async fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();

    if args.iter().any(|a| a == "-h" || a == "--help") {
        println!(
            "Usage: cargo run -p e2e-tests --bin search_quality -- [--api-url URL] [--file PATH] [--k K] [--min-mrr X] [--min-recall X]\n\n"
        );
        println!("Defaults:");
        println!("  --api-url   $TEST_API_URL or http://localhost:8000");
        println!("  --file      tests/data/semantic_search_golden.json");
        println!("  --k         from file (default 20)");
        println!("  --min-mrr   none (does not fail)");
        println!("  --min-recall none (does not fail)");
        return Ok(());
    }

    let api_url = parse_arg_value(&args, "--api-url")
        .or_else(|| std::env::var("TEST_API_URL").ok())
        .unwrap_or_else(|| "http://localhost:8000".to_string());

    let file = parse_arg_value(&args, "--file")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("tests/data/semantic_search_golden.json"));

    let min_mrr = parse_arg_f64(&args, "--min-mrr");
    let min_recall = parse_arg_f64(&args, "--min-recall");

    let raw = std::fs::read_to_string(&file)
        .with_context(|| format!("Failed to read golden set file: {}", file.display()))?;
    let mut golden: GoldenSet = serde_json::from_str(&raw)
        .with_context(|| format!("Failed to parse JSON: {}", file.display()))?;

    if let Some(k) = parse_arg_usize(&args, "--k") {
        golden.k = k;
    }

    if golden.cases.is_empty() {
        return Err(anyhow!("Golden set contains no cases"));
    }

    let graphql_url = format!("{}/graphql", api_url.trim_end_matches('/'));
    let client = Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .context("Failed to build HTTP client")?;

    let mut sum_rr = 0.0f64;
    let mut sum_recall = 0.0f64;

    println!("Running semantic search quality against: {graphql_url}");
    println!("Cases: {}, k={}", golden.cases.len(), golden.k);

    for (idx, c) in golden.cases.iter().enumerate() {
        let label = c
            .name
            .clone()
            .unwrap_or_else(|| format!("case-{}", idx + 1));

        let variables = json!({
            "query": c.query,
            "ecosystem": c.ecosystem,
            "first": golden.k as i32
        });

        let payload = json!({
            "query": r#"query($query: String!, $ecosystem: Ecosystem, $first: Int!) {
  semanticSearchPackages(query: $query, ecosystem: $ecosystem, first: $first) {
    edges { node { id } score }
  }
}"#,
            "variables": variables
        });

        let resp = client
            .post(&graphql_url)
            .json(&payload)
            .send()
            .await
            .with_context(|| format!("GraphQL request failed for {label}"))?;

        let status = resp.status();
        let body: Value = resp.json().await.context("Failed to decode GraphQL JSON")?;

        if !status.is_success() {
            return Err(anyhow!(
                "GraphQL HTTP error for {label}: {} - {}",
                status,
                body
            ));
        }

        if let Some(errors) = body.get("errors") {
            return Err(anyhow!("GraphQL returned errors for {label}: {errors}"));
        }

        let edges = body
            .pointer("/data/semanticSearchPackages/edges")
            .and_then(|v| v.as_array())
            .ok_or_else(|| anyhow!("Missing data.semanticSearchPackages.edges for {label}"))?;

        let mut got: Vec<String> = Vec::new();
        for e in edges {
            if let Some(id) = e.pointer("/node/id").and_then(|v| v.as_str()) {
                got.push(id.to_string());
            }
        }

        let expected_set: HashSet<&str> = c.expected.iter().map(|s| s.as_str()).collect();
        let mut first_hit: Option<usize> = None;
        let mut hit_count: usize = 0;

        for (pos, id) in got.iter().enumerate() {
            if expected_set.contains(id.as_str()) {
                hit_count += 1;
                if first_hit.is_none() {
                    first_hit = Some(pos);
                }
            }
        }

        let rr = first_hit.map(|p| 1.0 / (p as f64 + 1.0)).unwrap_or(0.0);
        let recall = if c.expected.is_empty() {
            0.0
        } else {
            hit_count as f64 / c.expected.len() as f64
        };

        sum_rr += rr;
        sum_recall += recall;

        println!(
            "{label}: RR@{}={:.3} Recall@{}={:.3} hits={}/{}",
            golden.k,
            rr,
            golden.k,
            recall,
            hit_count,
            c.expected.len()
        );
    }

    let n = golden.cases.len() as f64;
    let mrr = sum_rr / n;
    let avg_recall = sum_recall / n;

    println!("\nAggregate:");
    println!("MRR@{} = {:.4}", golden.k, mrr);
    println!("Recall@{} = {:.4}", golden.k, avg_recall);

    if let Some(min) = min_mrr {
        if mrr < min {
            return Err(anyhow!(
                "MRR@{} below threshold: {:.4} < {:.4}",
                golden.k,
                mrr,
                min
            ));
        }
    }
    if let Some(min) = min_recall {
        if avg_recall < min {
            return Err(anyhow!(
                "Recall@{} below threshold: {:.4} < {:.4}",
                golden.k,
                avg_recall,
                min
            ));
        }
    }

    Ok(())
}
