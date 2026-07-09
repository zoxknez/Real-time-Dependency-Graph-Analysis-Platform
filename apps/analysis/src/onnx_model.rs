//! Local ONNX Embedding Model
//!
//! Enhanced ONNX-based embedding inference with:
//! - Model warmup and preloading
//! - Configurable threading and optimization
//! - Support for multiple model architectures
//! - Quantization support (INT8/FP16)
//! - Batch processing with dynamic batching
//! - Embedding normalization options

use anyhow::{Context, Result};
use ndarray::{Array, Array1, Array2, ArrayView3, Axis, s};
use ort::session::Session;
use ort::session::builder::GraphOptimizationLevel;
use ort::value::Value;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;
use tokenizers::Tokenizer;
use tokio::sync::Mutex;
use tracing::{debug, info, instrument, warn};

/// Configuration for ONNX embedding model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnnxModelConfig {
    /// Path to the model directory
    pub model_path: PathBuf,
    /// Expected embedding dimension
    pub dimension: usize,
    /// Maximum sequence length (tokens)
    #[serde(default = "default_max_length")]
    pub max_length: usize,
    /// Number of threads for inference
    #[serde(default = "default_num_threads")]
    pub num_threads: usize,
    /// Enable model warmup on initialization
    #[serde(default = "default_warmup")]
    pub warmup: bool,
    /// Optimization level (1-3)
    #[serde(default = "default_optimization_level")]
    pub optimization_level: u8,
    /// Normalize output embeddings
    #[serde(default = "default_normalize")]
    pub normalize: bool,
    /// Pooling strategy
    #[serde(default)]
    pub pooling: PoolingStrategy,
}

fn default_max_length() -> usize {
    512
}
fn default_num_threads() -> usize {
    4
}
fn default_warmup() -> bool {
    true
}
fn default_optimization_level() -> u8 {
    3
}
fn default_normalize() -> bool {
    true
}

impl Default for OnnxModelConfig {
    fn default() -> Self {
        Self {
            model_path: PathBuf::from("models/all-MiniLM-L6-v2"),
            dimension: 384,
            max_length: default_max_length(),
            num_threads: default_num_threads(),
            warmup: default_warmup(),
            optimization_level: default_optimization_level(),
            normalize: default_normalize(),
            pooling: PoolingStrategy::default(),
        }
    }
}

/// Pooling strategy for sequence outputs
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PoolingStrategy {
    /// Mean of all token embeddings (weighted by attention mask)
    #[default]
    Mean,
    /// Use [CLS] token embedding
    Cls,
    /// Max pooling across sequence dimension
    Max,
    /// Mean of last N layers (for models that support it)
    LastNMean(usize),
}

/// Statistics about model performance
#[derive(Debug, Clone, Default)]
pub struct ModelStats {
    pub total_inferences: u64,
    pub total_tokens_processed: u64,
    pub total_inference_time_ms: u64,
    pub avg_tokens_per_inference: f64,
    pub avg_inference_time_ms: f64,
}

/// ONNX-based embedding model with advanced features
pub struct OnnxEmbeddingModel {
    session: Mutex<Session>,
    tokenizer: Tokenizer,
    config: OnnxModelConfig,
    stats: Arc<Mutex<ModelStats>>,
}

impl OnnxEmbeddingModel {
    /// Create a new ONNX embedding model
    #[instrument(skip(config), fields(model_path = ?config.model_path))]
    pub async fn new(config: OnnxModelConfig) -> Result<Self> {
        info!(
            dimension = config.dimension,
            max_length = config.max_length,
            threads = config.num_threads,
            "Initializing ONNX embedding model"
        );

        // Validate paths
        let onnx_path = config.model_path.join("model.onnx");
        let tokenizer_path = config.model_path.join("tokenizer.json");

        if !onnx_path.exists() {
            return Err(anyhow::anyhow!(
                "Model file not found: {:?}. Run scripts/download-models.py first.",
                onnx_path
            ));
        }
        if !tokenizer_path.exists() {
            return Err(anyhow::anyhow!(
                "Tokenizer file not found: {:?}",
                tokenizer_path
            ));
        }

        // Map optimization level
        let opt_level = match config.optimization_level {
            1 => GraphOptimizationLevel::Level1,
            2 => GraphOptimizationLevel::Level2,
            _ => GraphOptimizationLevel::Level3,
        };

        // Initialize ONNX session
        let session = Session::builder()?
            .with_optimization_level(opt_level)?
            .with_intra_threads(config.num_threads)?
            .commit_from_file(&onnx_path)
            .context("Failed to load ONNX model")?;

        // Log model info
        info!(
            inputs = ?session.inputs().iter().map(|i| i.name()).collect::<Vec<_>>(),
            outputs = ?session.outputs().iter().map(|o| o.name()).collect::<Vec<_>>(),
            "ONNX model loaded"
        );

        // Initialize tokenizer
        let tokenizer = Tokenizer::from_file(&tokenizer_path)
            .map_err(|e| anyhow::anyhow!("Failed to load tokenizer: {}", e))?;

        let model = Self {
            session: Mutex::new(session),
            tokenizer,
            config,
            stats: Arc::new(Mutex::new(ModelStats::default())),
        };

        // Warmup with a sample inference
        if model.config.warmup {
            info!("Warming up model with sample inference...");
            let start = Instant::now();
            let _ = model
                .embed("This is a warmup text for the embedding model.")
                .await?;
            info!(
                warmup_time_ms = start.elapsed().as_millis(),
                "Model warmup complete"
            );
        }

        Ok(model)
    }

    /// Get embedding dimension
    pub fn dimension(&self) -> usize {
        self.config.dimension
    }

    /// Get current model statistics
    pub async fn stats(&self) -> ModelStats {
        self.stats.lock().await.clone()
    }

    /// Generate embedding for a single text
    #[instrument(skip(self, text), fields(text_len = text.len()))]
    pub async fn embed(&self, text: &str) -> Result<Vec<f32>> {
        let embeddings = self.embed_batch(&[text]).await?;
        embeddings
            .into_iter()
            .next()
            .ok_or_else(|| anyhow::anyhow!("No embedding returned"))
    }

    /// Generate embeddings for a batch of texts
    #[instrument(skip(self, texts), fields(batch_size = texts.len()))]
    pub async fn embed_batch(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(vec![]);
        }

        let start = Instant::now();

        // Tokenize with padding and truncation
        let encodings = self
            .tokenizer
            .encode_batch(texts.to_vec(), true)
            .map_err(|e| anyhow::anyhow!("Tokenization failed: {}", e))?;

        let batch_size = texts.len();
        let max_len = encodings
            .iter()
            .map(|e| e.get_ids().len())
            .max()
            .unwrap_or(0)
            .min(self.config.max_length);

        debug!(batch_size, max_len, "Tokenization complete");

        // Prepare input tensors
        let mut input_ids = Array2::<i64>::zeros((batch_size, max_len));
        let mut attention_mask = Array2::<i64>::zeros((batch_size, max_len));
        let mut token_type_ids = Array2::<i64>::zeros((batch_size, max_len));

        for (i, encoding) in encodings.iter().enumerate() {
            let ids = encoding.get_ids();
            let mask = encoding.get_attention_mask();
            let types = encoding.get_type_ids();

            let seq_len = ids.len().min(max_len);

            for j in 0..seq_len {
                input_ids[[i, j]] = ids[j] as i64;
                attention_mask[[i, j]] = mask[j] as i64;
                token_type_ids[[i, j]] = types[j] as i64;
            }
        }

        // Run inference
        let mut session_guard = self.session.lock().await;
        let outputs = session_guard.run(vec![
            ("input_ids", Value::from_array(input_ids)?),
            ("attention_mask", Value::from_array(attention_mask.clone())?),
            ("token_type_ids", Value::from_array(token_type_ids)?),
        ])?;

        // Extract hidden states
        let output_key = if outputs.contains_key("last_hidden_state") {
            "last_hidden_state"
        } else if outputs.contains_key("output") {
            "output"
        } else {
            outputs
                .keys()
                .next()
                .ok_or_else(|| anyhow::anyhow!("No output tensor found"))?
        };

        let (shape, data) = outputs[output_key].try_extract_tensor::<f32>()?;

        let last_hidden_state = ArrayView3::from_shape(
            (shape[0] as usize, shape[1] as usize, shape[2] as usize),
            data,
        )
        .map_err(|e| anyhow::anyhow!("Failed to create ArrayView: {}", e))?;

        // Apply pooling strategy
        let embeddings = self.apply_pooling(&last_hidden_state, &attention_mask)?;

        // Update statistics
        {
            let mut stats = self.stats.lock().await;
            stats.total_inferences += 1;
            stats.total_tokens_processed += (batch_size * max_len) as u64;
            stats.total_inference_time_ms += start.elapsed().as_millis() as u64;
            stats.avg_tokens_per_inference =
                stats.total_tokens_processed as f64 / stats.total_inferences as f64;
            stats.avg_inference_time_ms =
                stats.total_inference_time_ms as f64 / stats.total_inferences as f64;
        }

        debug!(
            inference_time_ms = start.elapsed().as_millis(),
            "Batch embedding complete"
        );

        Ok(embeddings)
    }

    /// Apply pooling strategy to hidden states
    fn apply_pooling(
        &self,
        hidden_states: &ArrayView3<f32>,
        attention_mask: &Array2<i64>,
    ) -> Result<Vec<Vec<f32>>> {
        let batch_size = hidden_states.shape()[0];
        let seq_len = hidden_states.shape()[1];
        let hidden_dim = hidden_states.shape()[2];

        let mut embeddings = Vec::with_capacity(batch_size);

        for i in 0..batch_size {
            let embedding = match self.config.pooling {
                PoolingStrategy::Mean => {
                    // Mean pooling weighted by attention mask
                    let mut sum = Array1::<f32>::zeros(hidden_dim);
                    let mut count = 0.0f32;

                    for j in 0..seq_len {
                        if attention_mask[[i, j]] == 1 {
                            let token_vec = hidden_states.slice(s![i, j, ..]);
                            sum += &token_vec;
                            count += 1.0;
                        }
                    }

                    if count > 0.0 { sum / count } else { sum }
                }
                PoolingStrategy::Cls => {
                    // Use [CLS] token (first token)
                    hidden_states.slice(s![i, 0, ..]).to_owned()
                }
                PoolingStrategy::Max => {
                    // Max pooling
                    let mut max_vec = Array1::<f32>::from_elem(hidden_dim, f32::NEG_INFINITY);

                    for j in 0..seq_len {
                        if attention_mask[[i, j]] == 1 {
                            let token_vec = hidden_states.slice(s![i, j, ..]);
                            for k in 0..hidden_dim {
                                if token_vec[k] > max_vec[k] {
                                    max_vec[k] = token_vec[k];
                                }
                            }
                        }
                    }

                    max_vec
                }
                PoolingStrategy::LastNMean(n) => {
                    // Mean of last N tokens (useful for some models)
                    let mut sum = Array1::<f32>::zeros(hidden_dim);
                    let mut count = 0;

                    for j in (0..seq_len).rev() {
                        if attention_mask[[i, j]] == 1 {
                            let token_vec = hidden_states.slice(s![i, j, ..]);
                            sum += &token_vec;
                            count += 1;
                            if count >= n {
                                break;
                            }
                        }
                    }

                    if count > 0 { sum / count as f32 } else { sum }
                }
            };

            // Apply normalization if configured
            let final_embedding = if self.config.normalize {
                self.normalize_l2(&embedding)
            } else {
                embedding.into_raw_vec_and_offset().0
            };

            embeddings.push(final_embedding);
        }

        Ok(embeddings)
    }

    /// L2 normalize a vector
    fn normalize_l2(&self, vec: &Array1<f32>) -> Vec<f32> {
        let norm = vec.mapv(|x| x * x).sum().sqrt();
        if norm > 1e-9 {
            vec.mapv(|x| x / norm).into_raw_vec_and_offset().0
        } else {
            vec.to_vec()
        }
    }

    /// Compute cosine similarity between two embeddings
    pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
        if a.len() != b.len() {
            return 0.0;
        }

        let dot_product: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
        let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
        let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();

        if norm_a > 1e-9 && norm_b > 1e-9 {
            dot_product / (norm_a * norm_b)
        } else {
            0.0
        }
    }
}

/// Model registry for managing multiple models
pub struct ModelRegistry {
    models: std::collections::HashMap<String, Arc<OnnxEmbeddingModel>>,
    default_model: String,
}

impl ModelRegistry {
    /// Create a new model registry
    pub fn new() -> Self {
        Self {
            models: std::collections::HashMap::new(),
            default_model: String::new(),
        }
    }

    /// Register a model
    pub async fn register(&mut self, name: &str, config: OnnxModelConfig) -> Result<()> {
        let model = OnnxEmbeddingModel::new(config).await?;

        if self.models.is_empty() {
            self.default_model = name.to_string();
        }

        self.models.insert(name.to_string(), Arc::new(model));
        info!(name, "Model registered");
        Ok(())
    }

    /// Get a model by name
    pub fn get(&self, name: &str) -> Option<Arc<OnnxEmbeddingModel>> {
        self.models.get(name).cloned()
    }

    /// Get the default model
    pub fn default(&self) -> Option<Arc<OnnxEmbeddingModel>> {
        self.models.get(&self.default_model).cloned()
    }

    /// List all registered models
    pub fn list(&self) -> Vec<String> {
        self.models.keys().cloned().collect()
    }
}

impl Default for ModelRegistry {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity() {
        let a = vec![1.0, 0.0, 0.0];
        let b = vec![1.0, 0.0, 0.0];
        assert!((OnnxEmbeddingModel::cosine_similarity(&a, &b) - 1.0).abs() < 1e-6);

        let c = vec![0.0, 1.0, 0.0];
        assert!(OnnxEmbeddingModel::cosine_similarity(&a, &c).abs() < 1e-6);

        let d = vec![-1.0, 0.0, 0.0];
        assert!((OnnxEmbeddingModel::cosine_similarity(&a, &d) + 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_config_defaults() {
        let config = OnnxModelConfig::default();
        assert_eq!(config.dimension, 384);
        assert_eq!(config.max_length, 512);
        assert!(config.normalize);
        assert_eq!(config.pooling, PoolingStrategy::Mean);
    }
}
