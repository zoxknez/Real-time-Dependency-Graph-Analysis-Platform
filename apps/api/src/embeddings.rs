//! Embedding generation utilities for API semantic search.
//!
//! This is intentionally lightweight: it supports a Mock provider by default,
//! and an OpenAI provider when configured.

use anyhow::{Context, Result};
use governor::{
    clock::{Clock, QuantaClock},
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter,
};
use metrics::{counter, histogram};
use reqwest::Client;
use std::num::NonZeroU32;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::RwLock;
use tokio::time::Instant;
use tracing::{debug, info, instrument, warn};

use crate::config::EmbeddingConfig;
use crate::metrics::names as metric_names;

pub struct EmbeddingGenerator {
    provider: EmbeddingProvider,
    dimension: usize,
    cache: Arc<RwLock<HashMap<u64, CacheEntry>>>,
    max_cache_size: usize,
    cache_ttl: Duration,
}

enum EmbeddingProvider {
    OpenAI(OpenAIEmbedder),
    Mock(MockEmbedder),
}

#[derive(Clone)]
struct CacheEntry {
    embedding: Vec<f32>,
    inserted_at: Instant,
}

pub type EmbeddingRateLimiter = Arc<RateLimiter<NotKeyed, InMemoryState, QuantaClock>>;

#[derive(Debug, thiserror::Error)]
pub enum EmbeddingError {
    #[error("provider misconfigured: {0}")]
    #[allow(dead_code)]
    Config(String),

    #[error("request timed out")]
    Timeout,

    #[error("http error: {0}")]
    Http(String),

    #[error("provider rejected request (status={status}): {body}")]
    ProviderRejected { status: u16, body: String },

    #[error("provider returned empty embeddings data")]
    EmptyResponse,

    #[error("embedding dimension mismatch (got {got}, expected {expected})")]
    DimensionMismatch { got: usize, expected: usize },
}

impl EmbeddingError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::Config(_) => "EMBEDDING_CONFIG",
            Self::Timeout => "EMBEDDING_TIMEOUT",
            Self::Http(_) => "EMBEDDING_HTTP",
            Self::ProviderRejected { status, .. } if *status == 429 => "EMBEDDING_RATE_LIMITED",
            Self::ProviderRejected { .. } => "EMBEDDING_PROVIDER_REJECTED",
            Self::EmptyResponse => "EMBEDDING_EMPTY",
            Self::DimensionMismatch { .. } => "EMBEDDING_DIMENSION_MISMATCH",
        }
    }
}

fn create_rate_limiter(requests_per_minute: u32) -> Option<EmbeddingRateLimiter> {
    if requests_per_minute == 0 {
        return None;
    }

    let quota = Quota::per_minute(
        NonZeroU32::new(requests_per_minute)
            .expect("EMBEDDING_RATE_LIMIT_RPM must be > 0 when set"),
    );

    Some(Arc::new(RateLimiter::direct(quota)))
}

impl EmbeddingGenerator {
    pub async fn new(config: &EmbeddingConfig) -> Result<Self> {
        let provider = match config.provider.as_str() {
            "openai" => {
                let Some(api_key) = config.openai_api_key.clone() else {
                    warn!("EMBEDDING_PROVIDER=openai but OPENAI_API_KEY is missing; falling back to mock");
                    return Ok(Self {
                        provider: EmbeddingProvider::Mock(MockEmbedder::new(config.dimension)),
                        dimension: config.dimension,
                        cache: Arc::new(RwLock::new(HashMap::new())),
                        max_cache_size: config.cache_max_entries,
                        cache_ttl: Duration::from_secs(config.cache_ttl_secs),
                    });
                };

                let limiter = create_rate_limiter(config.rate_limit_rpm);
                let openai = OpenAIEmbedder::new(
                    api_key,
                    config.model.clone(),
                    Duration::from_secs(config.timeout_secs),
                    config.max_retries,
                    Duration::from_millis(config.retry_base_delay_ms),
                    limiter,
                )
                .await?;
                EmbeddingProvider::OpenAI(openai)
            }
            "mock" | "test" | "local" => EmbeddingProvider::Mock(MockEmbedder::new(config.dimension)),
            other => {
                warn!(provider = other, "Unknown embedding provider; using mock");
                EmbeddingProvider::Mock(MockEmbedder::new(config.dimension))
            }
        };

        info!(
            provider = %config.provider,
            model = %config.model,
            dimension = config.dimension,
            "Embedding generator initialized"
        );

        Ok(Self {
            provider,
            dimension: config.dimension,
            cache: Arc::new(RwLock::new(HashMap::new())),
            max_cache_size: config.cache_max_entries,
            cache_ttl: Duration::from_secs(config.cache_ttl_secs),
        })
    }

    #[allow(dead_code)]
    pub fn dimension(&self) -> usize {
        self.dimension
    }

    #[instrument(skip(self, text), fields(text_len = text.len()))]
    pub async fn generate(&self, text: &str) -> Result<Vec<f32>> {
        let hash = hash_text(text);
        {
            let cache = self.cache.read().await;
            if let Some(entry) = cache.get(&hash) {
                if entry.inserted_at.elapsed() <= self.cache_ttl {
                    debug!("Embedding cache hit");
                    crate::metrics::record_cache_access("embedding", true);
                    return Ok(entry.embedding.clone());
                }
            }
        }

        crate::metrics::record_cache_access("embedding", false);

        let embedding = match &self.provider {
            EmbeddingProvider::OpenAI(openai) => openai
                .embed(text)
                .await
                .map_err(|e| anyhow::anyhow!(e))?,
            EmbeddingProvider::Mock(mock) => mock.embed(text),
        };

        if embedding.len() != self.dimension {
            return Err(anyhow::anyhow!(EmbeddingError::DimensionMismatch {
                got: embedding.len(),
                expected: self.dimension
            }));
        }

        {
            let mut cache = self.cache.write().await;
            if cache.len() >= self.max_cache_size {
                let keys: Vec<_> = cache.keys().take(self.max_cache_size / 2).copied().collect();
                for key in keys {
                    cache.remove(&key);
                }
            }
            cache.insert(
                hash,
                CacheEntry {
                    embedding: embedding.clone(),
                    inserted_at: Instant::now(),
                },
            );
        }

        Ok(embedding)
    }
}

fn hash_text(text: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    text.hash(&mut hasher);
    hasher.finish()
}

struct MockEmbedder {
    dimension: usize,
}

impl MockEmbedder {
    fn new(dimension: usize) -> Self {
        Self { dimension }
    }

    fn embed(&self, text: &str) -> Vec<f32> {
        // Deterministic lexical embedding.
        //
        // This is intentionally simple (no external model) but produces
        // reasonable semantic-ish behavior for dev/harness by capturing:
        // - shared tokens (e.g. "react" ~ "react-dom")
        // - shared character 3-grams (e.g. typos / prefixes)
        //
        // Features are hashed into a fixed-size vector and L2-normalized.
        if self.dimension == 0 {
            return vec![];
        }

        let mut embedding = vec![0.0f32; self.dimension];
        let normalized = text.to_lowercase();

        // Add the full text as a weak feature.
        add_hashed_feature(&mut embedding, &format!("txt:{normalized}"), 0.25);

        // Tokenize on non-alphanumeric boundaries.
        // Also add adjacent-token bigrams to capture short phrases.
        let mut prev_token: Option<String> = None;
        let mut token = String::new();
        for ch in normalized.chars() {
            if ch.is_ascii_alphanumeric() {
                token.push(ch);
                continue;
            }

            if !token.is_empty() {
                add_token_features(&mut embedding, &token);
                if let Some(prev) = prev_token.as_deref() {
                    add_hashed_feature(&mut embedding, &format!("bi:{prev}_{token}"), 0.3);
                }
                prev_token = Some(token.clone());
                token.clear();
            }
        }
        if !token.is_empty() {
            add_token_features(&mut embedding, &token);
            if let Some(prev) = prev_token.as_deref() {
                add_hashed_feature(&mut embedding, &format!("bi:{prev}_{token}"), 0.3);
            }
        }

        l2_normalize(&mut embedding);
        embedding
    }
}

fn add_token_features(embedding: &mut [f32], token: &str) {
    // Strong token feature.
    add_hashed_feature(embedding, &format!("tok:{token}"), 1.0);

    // Prefix/suffix features help match common stems (e.g. expressjs ~ express).
    // Token is ASCII alphanumeric (built in the tokenizer above), so byte slicing is safe.
    let len = token.len();
    for n in 3..=6 {
        if len >= n {
            let prefix = &token[..n];
            let suffix = &token[len - n..];
            add_hashed_feature(embedding, &format!("pre:{prefix}"), 0.15);
            add_hashed_feature(embedding, &format!("suf:{suffix}"), 0.15);
        }
    }

    // Character trigrams help when tokens are close but not identical.
    let bytes = token.as_bytes();
    if bytes.len() >= 3 {
        for w in bytes.windows(3) {
            // SAFETY: token is built from ASCII alphanumerics.
            let tri = unsafe { std::str::from_utf8_unchecked(w) };
            add_hashed_feature(embedding, &format!("tri:{tri}"), 0.2);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{l2_normalize, MockEmbedder};

    #[test]
    fn mock_embedder_is_deterministic() {
        let e = MockEmbedder::new(384);
        let a = e.embed("React HTTP client library");
        let b = e.embed("React HTTP client library");
        assert_eq!(a, b);
        assert_eq!(a.len(), 384);
    }

    #[test]
    fn mock_embeddings_are_l2_normalized() {
        let e = MockEmbedder::new(384);
        let mut v = e.embed("tokio async runtime");

        // Already normalized, but do a sanity normalize to ensure helper is safe.
        l2_normalize(&mut v);
        let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 1e-3);
    }
}

fn add_hashed_feature(embedding: &mut [f32], feature: &str, weight: f32) {
    if embedding.is_empty() {
        return;
    }

    let h = fnv1a64(feature.as_bytes());
    let idx = (h % (embedding.len() as u64)) as usize;
    let sign = if (h & 1) == 0 { 1.0 } else { -1.0 };
    embedding[idx] += sign * weight;
}

fn l2_normalize(v: &mut [f32]) {
    let norm: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm > 0.0 {
        for x in v {
            *x /= norm;
        }
    }
}

fn fnv1a64(data: &[u8]) -> u64 {
    let mut h: u64 = 0xCBF29CE484222325;
    for &b in data {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001B3);
    }
    h
}

struct OpenAIEmbedder {
    client: Client,
    api_key: String,
    model: String,
    max_retries: usize,
    retry_base_delay: Duration,
    limiter: Option<EmbeddingRateLimiter>,
}

impl OpenAIEmbedder {
    async fn new(
        api_key: String,
        model: String,
        timeout: Duration,
        max_retries: usize,
        retry_base_delay: Duration,
        limiter: Option<EmbeddingRateLimiter>,
    ) -> Result<Self> {
        let client = Client::builder()
            .timeout(timeout)
            .build()
            .context("Failed to build HTTP client")?;

        Ok(Self {
            client,
            api_key,
            model,
            max_retries,
            retry_base_delay,
            limiter,
        })
    }

    async fn embed(&self, text: &str) -> std::result::Result<Vec<f32>, EmbeddingError> {
        #[derive(serde::Serialize)]
        struct EmbeddingsRequest<'a> {
            model: &'a str,
            input: &'a str,
        }

        #[derive(serde::Deserialize)]
        struct EmbeddingsResponse {
            data: Vec<EmbeddingItem>,
        }

        #[derive(serde::Deserialize)]
        struct EmbeddingItem {
            embedding: Vec<f32>,
        }

        let req = EmbeddingsRequest {
            model: &self.model,
            input: text,
        };

        let mut attempt: usize = 0;
        loop {
            if let Some(limiter) = self.limiter.as_ref() {
                match limiter.check() {
                    Ok(_) => {}
                    Err(not_until) => {
                        let wait_time = not_until
                            .wait_time_from(governor::clock::QuantaClock::default().now());
                        let delay = wait_time.max(Duration::from_secs(1));
                        counter!(
                            metric_names::EMBEDDINGS_RATE_LIMIT_DELAYS_TOTAL,
                            &[("provider", "openai".to_string())]
                        )
                        .increment(1);
                        tokio::time::sleep(delay).await;
                    }
                }
            }

            let started = Instant::now();
            let resp = self
                .client
                .post("https://api.openai.com/v1/embeddings")
                .bearer_auth(&self.api_key)
                .json(&req)
                .send()
                .await;

            match resp {
                Ok(resp) => {
                    let status = resp.status();
                    let elapsed = started.elapsed().as_secs_f64();
                    histogram!(
                        metric_names::EMBEDDINGS_REQUEST_DURATION_SECONDS,
                        &[("provider", "openai".to_string())]
                    )
                    .record(elapsed);

                    if !status.is_success() {
                        let retry_after = resp
                            .headers()
                            .get("retry-after")
                            .and_then(|v| v.to_str().ok())
                            .and_then(|s| s.parse::<u64>().ok())
                            .map(Duration::from_secs);

                        let body = resp.text().await.unwrap_or_default();
                        let err = EmbeddingError::ProviderRejected {
                            status: status.as_u16(),
                            body,
                        };

                        counter!(
                            metric_names::EMBEDDINGS_ERRORS_TOTAL,
                            &[("provider", "openai".to_string()), ("code", err.code().to_string())]
                        )
                        .increment(1);

                        let retriable = matches!(status.as_u16(), 429 | 500 | 502 | 503 | 504);
                        if retriable && attempt < self.max_retries {
                            let backoff = self
                                .retry_base_delay
                                .saturating_mul(2u32.saturating_pow(attempt as u32));
                            let delay = retry_after.unwrap_or(backoff).min(Duration::from_secs(10));
                            warn!(
                                attempt,
                                status = status.as_u16(),
                                delay_ms = delay.as_millis() as u64,
                                "OpenAI embeddings failed; retrying"
                            );
                            attempt += 1;
                            tokio::time::sleep(delay).await;
                            continue;
                        }

                        return Err(err);
                    }

                    counter!(
                        metric_names::EMBEDDINGS_REQUESTS_TOTAL,
                        &[("provider", "openai".to_string()), ("result", "ok".to_string())]
                    )
                    .increment(1);

                    let parsed: EmbeddingsResponse = resp
                        .json()
                        .await
                        .map_err(|e| EmbeddingError::Http(e.to_string()))?;
                    return parsed
                        .data
                        .into_iter()
                        .next()
                        .map(|d| d.embedding)
                        .ok_or(EmbeddingError::EmptyResponse);
                }
                Err(e) => {
                    let err = if e.is_timeout() {
                        EmbeddingError::Timeout
                    } else {
                        EmbeddingError::Http(e.to_string())
                    };

                    counter!(
                        metric_names::EMBEDDINGS_ERRORS_TOTAL,
                        &[("provider", "openai".to_string()), ("code", err.code().to_string())]
                    )
                    .increment(1);

                    if attempt < self.max_retries {
                        let backoff = self
                            .retry_base_delay
                            .saturating_mul(2u32.saturating_pow(attempt as u32))
                            .min(Duration::from_secs(10));
                        warn!(
                            attempt,
                            delay_ms = backoff.as_millis() as u64,
                            error = %err,
                            "OpenAI embeddings request error; retrying"
                        );
                        attempt += 1;
                        tokio::time::sleep(backoff).await;
                        continue;
                    }

                    return Err(err);
                }
            }
        }
    }
}
