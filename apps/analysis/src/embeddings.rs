//! Embedding Generation Module
//!
//! Supports multiple embedding providers:
//! - Local: ONNX Runtime with sentence-transformers models
//! - OpenAI: API-based embeddings
//!
//! Features:
//! - Batched processing for efficiency
//! - Retry with exponential backoff
//! - Caching for repeated texts

use crate::config::EmbeddingConfig;
use anyhow::{Context, Result};
#[cfg(feature = "onnx")]
use ndarray::{Array, ArrayView3};
#[cfg(feature = "onnx")]
use ort::session::Session;
#[cfg(feature = "onnx")]
use ort::session::builder::GraphOptimizationLevel;
#[cfg(feature = "onnx")]
use ort::value::Value;
use std::collections::HashMap;
#[cfg(feature = "onnx")]
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
#[cfg(feature = "onnx")]
use tokenizers::Tokenizer;
#[cfg(feature = "onnx")]
use tokio::sync::Mutex;
use tokio::sync::RwLock;
use tracing::{debug, info, instrument, warn};

// ═══════════════════════════════════════════════════════════════
// EMBEDDING GENERATOR
// ═══════════════════════════════════════════════════════════════

/// Multi-provider embedding generator
pub struct EmbeddingGenerator {
    provider: EmbeddingProvider,
    dimension: usize,
    batch_size: usize,
    /// Simple in-memory cache for repeated texts
    cache: Arc<RwLock<HashMap<u64, Vec<f32>>>>,
    max_cache_size: usize,
}

#[allow(clippy::large_enum_variant)]
enum EmbeddingProvider {
    /// Local ONNX-based embeddings
    #[cfg(feature = "onnx")]
    Local(LocalEmbedder),
    /// OpenAI API embeddings
    OpenAI(OpenAIEmbedder),
    /// Mock embeddings for testing
    Mock(MockEmbedder),
}

impl EmbeddingGenerator {
    /// Create a new embedding generator based on configuration
    #[allow(unused)]
    pub async fn new(config: &EmbeddingConfig) -> Result<Self> {
        info!(
            provider = %config.provider,
            model = %config.model_path,
            dimension = config.dimension,
            "Initializing embedding generator"
        );

        let provider = match config.provider.as_str() {
            "local" | "onnx" => {
                #[cfg(feature = "onnx")]
                {
                    let model_path = Some(config.model_path.clone());
                    let local = LocalEmbedder::new(&model_path, config.dimension)
                        .await
                        .context("Failed to initialize local embedder")?;
                    EmbeddingProvider::Local(local)
                }
                #[cfg(not(feature = "onnx"))]
                {
                    return Err(anyhow::anyhow!(
                        "Local ONNX embeddings require building analysis with the `onnx` feature"
                    ));
                }
            }
            "openai" => {
                if config.openai_api_key.is_none() {
                    return Err(anyhow::anyhow!("OpenAI API key not configured"));
                }
                let openai = OpenAIEmbedder::new(
                    config.openai_api_key.clone(),
                    config.model_path.clone(),
                    None, // No custom API base URL in config
                )
                .await
                .context("Failed to initialize OpenAI embedder")?;
                EmbeddingProvider::OpenAI(openai)
            }
            "mock" | "test" => {
                let mock = MockEmbedder::new(config.dimension);
                EmbeddingProvider::Mock(mock)
            }
            unknown => {
                return Err(anyhow::anyhow!(format!(
                    "Unknown embedding provider: {unknown}"
                )));
            }
        };

        Ok(Self {
            provider,
            dimension: config.dimension,
            batch_size: config.batch_size,
            cache: Arc::new(RwLock::new(HashMap::new())),
            max_cache_size: 10_000,
        })
    }

    /// Get embedding dimension
    pub fn dimension(&self) -> usize {
        self.dimension
    }

    /// Generate embedding for a single text
    #[instrument(skip(self, text), fields(text_len = text.len()))]
    pub async fn generate(&self, text: &str) -> Result<Vec<f32>> {
        // Check cache
        let hash = self.hash_text(text);
        {
            let cache = self.cache.read().await;
            if let Some(embedding) = cache.get(&hash) {
                debug!("Cache hit");
                return Ok(embedding.clone());
            }
        }

        // Generate embedding
        let embedding = match &self.provider {
            #[cfg(feature = "onnx")]
            EmbeddingProvider::Local(local) => local.embed(text).await?,
            EmbeddingProvider::OpenAI(openai) => openai.embed(text).await?,
            EmbeddingProvider::Mock(mock) => mock.embed(text),
        };

        // Cache result
        {
            let mut cache = self.cache.write().await;
            if cache.len() >= self.max_cache_size {
                // Simple eviction: clear half
                let keys: Vec<_> = cache
                    .keys()
                    .take(self.max_cache_size / 2)
                    .copied()
                    .collect();
                for key in keys {
                    cache.remove(&key);
                }
            }
            cache.insert(hash, embedding.clone());
        }

        Ok(embedding)
    }

    /// Generate embeddings for multiple texts with batching
    #[instrument(skip(self, texts), fields(count = texts.len()))]
    pub async fn generate_batch(&self, texts: &[String]) -> Result<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(vec![]);
        }

        debug!(count = texts.len(), "Generating batch embeddings");

        let mut results = Vec::with_capacity(texts.len());
        let mut uncached_indices = Vec::new();
        let mut uncached_texts = Vec::new();

        // Check cache for each text
        {
            let cache = self.cache.read().await;
            for (i, text) in texts.iter().enumerate() {
                let hash = self.hash_text(text);
                if let Some(embedding) = cache.get(&hash) {
                    results.push(Some(embedding.clone()));
                } else {
                    results.push(None);
                    uncached_indices.push(i);
                    uncached_texts.push(text.as_str());
                }
            }
        }

        // Generate embeddings for uncached texts
        if !uncached_texts.is_empty() {
            debug!(
                count = uncached_texts.len(),
                "Generating uncached embeddings"
            );

            // Process in batches
            for chunk_start in (0..uncached_texts.len()).step_by(self.batch_size) {
                let chunk_end = (chunk_start + self.batch_size).min(uncached_texts.len());
                let chunk: Vec<&str> = uncached_texts[chunk_start..chunk_end].to_vec();

                let chunk_embeddings = match &self.provider {
                    #[cfg(feature = "onnx")]
                    EmbeddingProvider::Local(local) => local.embed_batch(&chunk).await?,
                    EmbeddingProvider::OpenAI(openai) => openai.embed_batch(&chunk).await?,
                    EmbeddingProvider::Mock(mock) => mock.embed_batch(&chunk),
                };

                // Update results and cache
                {
                    let mut cache = self.cache.write().await;
                    for (j, embedding) in chunk_embeddings.into_iter().enumerate() {
                        let global_idx = uncached_indices[chunk_start + j];
                        let hash = self.hash_text(&texts[global_idx]);
                        cache.insert(hash, embedding.clone());
                        results[global_idx] = Some(embedding);
                    }
                }
            }
        }

        // Convert Option<Vec<f32>> to Vec<f32>
        Ok(results.into_iter().map(|o| o.unwrap_or_default()).collect())
    }

    /// Simple hash function for cache keys
    fn hash_text(&self, text: &str) -> u64 {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        text.hash(&mut hasher);
        hasher.finish()
    }
}

// ═══════════════════════════════════════════════════════════════
// LOCAL EMBEDDER (ONNX)
// ═══════════════════════════════════════════════════════════════

/// Local embedding using ONNX Runtime
#[cfg(feature = "onnx")]
struct LocalEmbedder {
    session: Mutex<Session>,
    tokenizer: Tokenizer,
    dimension: usize,
}

#[cfg(feature = "onnx")]
impl LocalEmbedder {
    async fn new(model_path_str: &Option<String>, dimension: usize) -> Result<Self> {
        let model_path = model_path_str
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Model path required for local embedder"))?;

        info!(path = %model_path, "Initializing local ONNX embedder");

        let onnx_path = Path::new(model_path).join("model.onnx");
        let tokenizer_path = Path::new(model_path).join("tokenizer.json");

        if !onnx_path.exists() {
            return Err(anyhow::anyhow!("Model file not found at {:?}", onnx_path));
        }
        if !tokenizer_path.exists() {
            return Err(anyhow::anyhow!(
                "Tokenizer file not found at {:?}",
                tokenizer_path
            ));
        }

        // Initialize ONNX session
        let session = Session::builder()?
            .with_optimization_level(GraphOptimizationLevel::Level3)?
            .with_intra_threads(4)?
            .commit_from_file(onnx_path)?;

        // Initialize Tokenizer
        let tokenizer = Tokenizer::from_file(tokenizer_path)
            .map_err(|e| anyhow::anyhow!("Failed to load tokenizer: {}", e))?;

        Ok(Self {
            session: Mutex::new(session),
            tokenizer,
            dimension,
        })
    }

    async fn embed(&self, text: &str) -> Result<Vec<f32>> {
        let embeddings = self.embed_batch(&[text]).await?;
        embeddings
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("No embedding returned"))
    }

    async fn embed_batch(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(vec![]);
        }

        // Tokenize
        let encodings = self
            .tokenizer
            .encode_batch(texts.to_vec(), true)
            .map_err(|e| anyhow::anyhow!("Tokenization failed: {}", e))?;

        let batch_size = texts.len();
        let max_len = encodings[0].get_ids().len();

        let mut input_ids = Array::zeros((batch_size, max_len));
        let mut attention_mask = Array::zeros((batch_size, max_len));
        let mut token_type_ids = Array::zeros((batch_size, max_len));

        for (i, encoding) in encodings.iter().enumerate() {
            for (j, &id) in encoding.get_ids().iter().enumerate() {
                input_ids[[i, j]] = id as i64;
            }
            for (j, &mask) in encoding.get_attention_mask().iter().enumerate() {
                attention_mask[[i, j]] = mask as i64;
            }
            for (j, &type_id) in encoding.get_type_ids().iter().enumerate() {
                token_type_ids[[i, j]] = type_id as i64;
            }
        }

        // Run inference
        let mut session_guard = self.session.lock().await;
        let outputs = session_guard.run(vec![
            ("input_ids", Value::from_array(input_ids)?),
            ("attention_mask", Value::from_array(attention_mask.clone())?),
            ("token_type_ids", Value::from_array(token_type_ids)?),
        ])?;

        let (shape, data) = outputs["last_hidden_state"].try_extract_tensor::<f32>()?;

        // Convert to ArrayView3
        let last_hidden_state = ArrayView3::from_shape(
            (shape[0] as usize, shape[1] as usize, shape[2] as usize),
            data,
        )
        .map_err(|e| anyhow::anyhow!("Failed to create ArrayView: {}", e))?;

        // Mean Pooling
        let mut embeddings = Vec::with_capacity(batch_size);
        for i in 0..batch_size {
            let mut sum_vec = Array::zeros(self.dimension);
            let mut count = 0.0f32;

            for j in 0..max_len {
                if attention_mask[[i, j]] == 1 {
                    let token_vec = last_hidden_state.slice(ndarray::s![i, j, ..]);
                    sum_vec += &token_vec;
                    count += 1.0;
                }
            }

            let mut final_vec = if count > 0.0 {
                sum_vec / count
            } else {
                sum_vec
            };

            // L2 Normalization
            let norm = final_vec.mapv(|x: f32| x * x).sum().sqrt();
            if norm > 1e-6 {
                final_vec /= norm;
            }

            embeddings.push(final_vec.into_raw_vec_and_offset().0);
        }

        Ok(embeddings)
    }
}

// ═══════════════════════════════════════════════════════════════
// OPENAI EMBEDDER
// ═══════════════════════════════════════════════════════════════

/// OpenAI API-based embedding generator
struct OpenAIEmbedder {
    client: reqwest::Client,
    api_key: Option<String>,
    model: String,
    base_url: Option<String>,
}

impl OpenAIEmbedder {
    async fn new(api_key: Option<String>, model: String, base_url: Option<String>) -> Result<Self> {
        info!(model = %model, "Initializing OpenAI embedder");

        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .context("Failed to create HTTP client")?;

        Ok(Self {
            client,
            api_key,
            model,
            base_url,
        })
    }

    async fn embed(&self, text: &str) -> Result<Vec<f32>> {
        let embeddings = self.embed_batch(&[text]).await?;
        embeddings
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("No embedding returned"))
    }

    async fn embed_batch(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>> {
        let api_key = self
            .api_key
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("OpenAI API key not configured"))?;

        let base_url = self.base_url.as_deref().unwrap_or("https://api.openai.com");
        let url = format!("{}/v1/embeddings", base_url);

        #[derive(serde::Serialize)]
        struct EmbeddingRequest {
            model: String,
            input: Vec<String>,
        }

        #[derive(serde::Deserialize)]
        struct EmbeddingResponse {
            data: Vec<EmbeddingData>,
        }

        #[derive(serde::Deserialize)]
        struct EmbeddingData {
            embedding: Vec<f32>,
        }

        let request = EmbeddingRequest {
            model: self.model.clone(),
            input: texts.iter().map(|s| s.to_string()).collect(),
        };

        // Retry with exponential backoff
        let mut delay = Duration::from_millis(100);
        let max_retries = 3;

        for attempt in 0..max_retries {
            let response = self
                .client
                .post(&url)
                .header("Authorization", format!("Bearer {}", api_key))
                .header("Content-Type", "application/json")
                .json(&request)
                .send()
                .await;

            match response {
                Ok(resp) if resp.status().is_success() => {
                    let embedding_resp: EmbeddingResponse = resp.json().await?;
                    return Ok(embedding_resp
                        .data
                        .into_iter()
                        .map(|d| d.embedding)
                        .collect());
                }
                Ok(resp) if resp.status().as_u16() == 429 => {
                    // Rate limited, backoff
                    warn!(attempt, "Rate limited, backing off");
                    tokio::time::sleep(delay).await;
                    delay *= 2;
                }
                Ok(resp) => {
                    let status = resp.status();
                    let body = resp.text().await.unwrap_or_default();
                    return Err(anyhow::anyhow!("API error {}: {}", status, body));
                }
                Err(e) if attempt < max_retries - 1 => {
                    warn!(error = %e, attempt, "Request failed, retrying");
                    tokio::time::sleep(delay).await;
                    delay *= 2;
                }
                Err(e) => {
                    return Err(e.into());
                }
            }
        }

        Err(anyhow::anyhow!("Max retries exceeded"))
    }
}

// ═══════════════════════════════════════════════════════════════
// MOCK EMBEDDER
// ═══════════════════════════════════════════════════════════════

/// Mock embedder for testing
struct MockEmbedder {
    dimension: usize,
}

impl MockEmbedder {
    fn new(dimension: usize) -> Self {
        Self { dimension }
    }

    fn embed(&self, text: &str) -> Vec<f32> {
        // Deterministic embedding based on text
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        text.hash(&mut hasher);
        let seed = hasher.finish();

        let mut embedding = vec![0.0f32; self.dimension];
        for (i, val) in embedding.iter_mut().enumerate() {
            *val = ((seed.wrapping_add(i as u64) % 1000) as f32 / 1000.0) * 2.0 - 1.0;
        }

        // Normalize
        let norm: f32 = embedding.iter().map(|x| x * x).sum::<f32>().sqrt();
        if norm > 0.0 {
            for val in &mut embedding {
                *val /= norm;
            }
        }

        embedding
    }

    fn embed_batch(&self, texts: &[&str]) -> Vec<Vec<f32>> {
        texts.iter().map(|t| self.embed(t)).collect()
    }
}

// ═══════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_mock_embedder() {
        let config = EmbeddingConfig::default();
        let generator = EmbeddingGenerator::new(&config).await.unwrap();

        let embedding = generator.generate("test text").await.unwrap();
        assert_eq!(embedding.len(), config.dimension);

        // Check normalization
        let norm: f32 = embedding.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((norm - 1.0).abs() < 0.01);
    }

    #[tokio::test]
    async fn test_batch_embeddings() {
        let config = EmbeddingConfig::default();
        let generator = EmbeddingGenerator::new(&config).await.unwrap();

        let texts = vec![
            "first text".to_string(),
            "second text".to_string(),
            "third text".to_string(),
        ];

        let embeddings = generator.generate_batch(&texts).await.unwrap();
        assert_eq!(embeddings.len(), 3);

        for emb in &embeddings {
            assert_eq!(emb.len(), config.dimension);
        }
    }

    #[tokio::test]
    async fn test_embedding_cache() {
        let config = EmbeddingConfig::default();
        let generator = EmbeddingGenerator::new(&config).await.unwrap();

        let text = "cached text";

        // First call
        let emb1 = generator.generate(text).await.unwrap();
        // Second call should hit cache
        let emb2 = generator.generate(text).await.unwrap();

        assert_eq!(emb1, emb2);
    }

    #[test]
    fn test_deterministic_embeddings() {
        let embedder = MockEmbedder::new(384);

        let text = "same text";
        let emb1 = embedder.embed(text);
        let emb2 = embedder.embed(text);

        assert_eq!(emb1, emb2);
    }
}
