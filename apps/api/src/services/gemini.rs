use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use tracing::{error, info, instrument};

#[derive(Debug, Clone)]
pub struct GeminiService {
    client: Client,
    api_key: String,
    #[allow(dead_code)]
    flash_model: String, // e.g. "gemini-3.8-flash"
    thinking_model: String, // e.g. "gemini-3.8-flash"
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerateContentRequest {
    contents: Vec<Content>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GenerationConfig>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Content {
    parts: Vec<Part>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Part {
    text: String,
    // Supported for multi-turn/history in future
    #[serde(skip_serializing_if = "Option::is_none")]
    thought_signature: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking_config: Option<ThinkingConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<i32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ThinkingConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking_level: Option<String>, // "high" | "low" | "medium" | "minimal"
    #[serde(skip_serializing_if = "Option::is_none")]
    include_thoughts: Option<bool>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct GenerateContentResponse {
    candidates: Option<Vec<Candidate>>,
    error: Option<ErrorResponse>,
}

#[derive(Deserialize, Debug)]
struct ErrorResponse {
    code: i32,
    message: String,
    #[allow(dead_code)]
    status: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct Candidate {
    content: CandidateContent,
    #[serde(rename = "finishReason")]
    #[allow(dead_code)]
    finish_reason: Option<String>,
}

#[derive(Deserialize, Debug)]
struct CandidateContent {
    parts: Vec<CandidatePart>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct CandidatePart {
    text: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    thought_signature: Option<String>, // Gemini 3 thoughtSignature
    thought: Option<bool>,
}

impl GeminiService {
    pub fn new(api_key: String, flash_model: String, thinking_model: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            flash_model,
            thinking_model,
        }
    }

    /// Get the API key for agent use
    pub fn api_key(&self) -> &str {
        &self.api_key
    }

    /// Model selected for complex reasoning and agent execution.
    pub fn thinking_model(&self) -> &str {
        &self.thinking_model
    }

    /// Fast generation using the Flash model (Low thinking level)
    #[allow(dead_code)]
    #[instrument(skip(self, prompt), fields(model = %self.flash_model))]
    pub async fn generate_fast(&self, prompt: &str) -> Result<String> {
        self.generate_internal(&self.flash_model, prompt, false)
            .await
    }

    /// Complex reasoning using the Thinking model (High thinking level)
    #[instrument(skip(self, prompt), fields(model = %self.thinking_model))]
    pub async fn generate_thinking(&self, prompt: &str) -> Result<String> {
        self.generate_internal(&self.thinking_model, prompt, true)
            .await
    }

    // Legacy method
    #[allow(dead_code)]
    pub async fn generate_content(&self, prompt: &str) -> Result<String> {
        self.generate_fast(prompt).await
    }

    async fn generate_internal(
        &self,
        model: &str,
        prompt: &str,
        high_thinking: bool,
    ) -> Result<String> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            model
        );

        // Gemini 3.8 Flash supports low, medium, and high thinking levels.
        // We stick to "high" for thinking_model and "low" for flash_model (as optimization)
        let thinking_level = if high_thinking { "high" } else { "low" };

        // Always sending thinking_config for Gemini 3 models to be explicit
        let thinking_config = Some(ThinkingConfig {
            thinking_level: Some(thinking_level.to_string()),
            include_thoughts: Some(false),
        });

        let request_body = GenerateContentRequest {
            contents: vec![Content {
                parts: vec![Part {
                    text: prompt.to_string(),
                    thought_signature: None,
                }],
            }],
            generation_config: Some(GenerationConfig {
                thinking_config,
                max_output_tokens: Some(if high_thinking { 4096 } else { 2048 }),
            }),
        };

        info!("Sending request to Gemini API ({})", model);

        let response = self
            .client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
            .json(&request_body)
            .send()
            .await
            .context("Failed to send request to Gemini API")?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            error!("Gemini API error ({}) : {} - {}", model, status, text);
            return Err(anyhow::anyhow!(
                "Gemini API error ({}) : {} - {}",
                model,
                status,
                text
            ));
        }

        let response_body: GenerateContentResponse = response
            .json()
            .await
            .context("Failed to parse Gemini API response")?;

        if let Some(err) = response_body.error {
            return Err(anyhow::anyhow!(
                "Gemini API error: {} - {}",
                err.code,
                err.message
            ));
        }

        let candidate = response_body
            .candidates
            .as_ref()
            .and_then(|c| c.first())
            .context("No candidates returned from Gemini API")?;

        // Aggregate text parts
        // In Gemini 3, we might get parts with thoughtSignature but no text.
        // We filter for text.
        let text = candidate
            .content
            .parts
            .iter()
            .filter_map(|p| {
                if p.thought == Some(true) {
                    None
                } else {
                    p.text.as_deref()
                }
            })
            .collect::<Vec<_>>()
            .join("");

        if text.trim().is_empty() {
            if let Some(finish_reason) = &candidate.finish_reason {
                return Err(anyhow::anyhow!(
                    "No text content. Finish reason: {}",
                    finish_reason
                ));
            }
            return Err(anyhow::anyhow!("Empty text in Gemini response"));
        }

        Ok(text)
    }
}
