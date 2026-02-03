//! Gemini 3 Autonomous Security Agent with Function Calling
//!
//! This module implements a sophisticated AI agent that leverages Gemini 3's
//! advanced capabilities for autonomous supply chain security analysis:
//!
//! - **Function Calling**: Agent can invoke GraphQL tools to gather data
//! - **Thinking Levels**: Uses "high" thinking for complex reasoning
//! - **Thought Signatures**: Maintains context across multi-step operations
//! - **Multi-step Workflows**: Autonomous scan → analyze → remediate pipeline
//!
//! Strategic Track: "The Marathon Agent" - Autonomous systems for long-running tasks

use anyhow::{Context, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tracing::{debug, error, info, instrument, warn};

// ═══════════════════════════════════════════════════════════════════════════════
// FUNCTION DECLARATIONS - Tools the Agent can use
// ═══════════════════════════════════════════════════════════════════════════════

/// All available tools for the Security Agent
pub fn get_security_agent_tools() -> Vec<FunctionDeclaration> {
    vec![
        // Tool 1: Search packages in the dependency graph
        FunctionDeclaration {
            name: "search_packages".to_string(),
            description: "Search for packages in the dependency graph by name or pattern. Returns matching packages with their ecosystems and versions.".to_string(),
            parameters: FunctionParameters {
                param_type: "object".to_string(),
                properties: {
                    let mut props = HashMap::new();
                    props.insert("query".to_string(), PropertySchema {
                        prop_type: "string".to_string(),
                        description: "The search query - package name or pattern".to_string(),
                        enum_values: None,
                    });
                    props.insert("ecosystem".to_string(), PropertySchema {
                        prop_type: "string".to_string(),
                        description: "Filter by ecosystem".to_string(),
                        enum_values: Some(vec!["npm".to_string(), "pypi".to_string(), "cargo".to_string(), "go".to_string(), "maven".to_string()]),
                    });
                    props.insert("limit".to_string(), PropertySchema {
                        prop_type: "integer".to_string(),
                        description: "Maximum number of results to return (default: 20)".to_string(),
                        enum_values: None,
                    });
                    props
                },
                required: vec!["query".to_string()],
            },
        },
        // Tool 2: Get vulnerabilities for a package
        FunctionDeclaration {
            name: "get_vulnerabilities".to_string(),
            description: "Get known vulnerabilities (CVEs) for a specific package. Returns severity, description, and remediation info.".to_string(),
            parameters: FunctionParameters {
                param_type: "object".to_string(),
                properties: {
                    let mut props = HashMap::new();
                    props.insert("package_id".to_string(), PropertySchema {
                        prop_type: "string".to_string(),
                        description: "The package ID (e.g., 'npm:lodash' or 'npm:lodash@4.17.21')".to_string(),
                        enum_values: None,
                    });
                    props.insert("severity_filter".to_string(), PropertySchema {
                        prop_type: "string".to_string(),
                        description: "Filter by minimum severity".to_string(),
                        enum_values: Some(vec!["critical".to_string(), "high".to_string(), "medium".to_string(), "low".to_string()]),
                    });
                    props
                },
                required: vec!["package_id".to_string()],
            },
        },
        // Tool 3: Get dependency path between packages
        FunctionDeclaration {
            name: "get_dependency_path".to_string(),
            description: "Find the shortest dependency path between two packages. Shows how a vulnerability in a transitive dependency reaches your project.".to_string(),
            parameters: FunctionParameters {
                param_type: "object".to_string(),
                properties: {
                    let mut props = HashMap::new();
                    props.insert("from_package".to_string(), PropertySchema {
                        prop_type: "string".to_string(),
                        description: "Source package ID (your project root)".to_string(),
                        enum_values: None,
                    });
                    props.insert("to_package".to_string(), PropertySchema {
                        prop_type: "string".to_string(),
                        description: "Target package ID (vulnerable dependency)".to_string(),
                        enum_values: None,
                    });
                    props
                },
                required: vec!["from_package".to_string(), "to_package".to_string()],
            },
        },
        // Tool 4: Get impact radius of a package
        FunctionDeclaration {
            name: "get_impact_radius".to_string(),
            description: "Analyze how many packages depend on a given package (reverse dependencies). Critical for assessing vulnerability blast radius.".to_string(),
            parameters: FunctionParameters {
                param_type: "object".to_string(),
                properties: {
                    let mut props = HashMap::new();
                    props.insert("package_id".to_string(), PropertySchema {
                        prop_type: "string".to_string(),
                        description: "The package to analyze".to_string(),
                        enum_values: None,
                    });
                    props.insert("depth".to_string(), PropertySchema {
                        prop_type: "integer".to_string(),
                        description: "How many levels of reverse dependencies to analyze (default: 3)".to_string(),
                        enum_values: None,
                    });
                    props
                },
                required: vec!["package_id".to_string()],
            },
        },
        // Tool 5: Generate SBOM for a package
        FunctionDeclaration {
            name: "generate_sbom".to_string(),
            description: "Generate a Software Bill of Materials (SBOM) for a package in SPDX or CycloneDX format.".to_string(),
            parameters: FunctionParameters {
                param_type: "object".to_string(),
                properties: {
                    let mut props = HashMap::new();
                    props.insert("package_id".to_string(), PropertySchema {
                        prop_type: "string".to_string(),
                        description: "The package to generate SBOM for".to_string(),
                        enum_values: None,
                    });
                    props.insert("format".to_string(), PropertySchema {
                        prop_type: "string".to_string(),
                        description: "SBOM format".to_string(),
                        enum_values: Some(vec!["spdx".to_string(), "cyclonedx".to_string()]),
                    });
                    props.insert("include_transitive".to_string(), PropertySchema {
                        prop_type: "boolean".to_string(),
                        description: "Include transitive dependencies (default: true)".to_string(),
                        enum_values: None,
                    });
                    props
                },
                required: vec!["package_id".to_string()],
            },
        },
        // Tool 6: Evaluate security policy
        FunctionDeclaration {
            name: "evaluate_policy".to_string(),
            description: "Evaluate a package against security policies (license compliance, vulnerability thresholds, SLSA levels, etc.)".to_string(),
            parameters: FunctionParameters {
                param_type: "object".to_string(),
                properties: {
                    let mut props = HashMap::new();
                    props.insert("package_id".to_string(), PropertySchema {
                        prop_type: "string".to_string(),
                        description: "The package to evaluate".to_string(),
                        enum_values: None,
                    });
                    props.insert("policy_name".to_string(), PropertySchema {
                        prop_type: "string".to_string(),
                        description: "Which policy to apply".to_string(),
                        enum_values: Some(vec!["strict".to_string(), "standard".to_string(), "permissive".to_string()]),
                    });
                    props
                },
                required: vec!["package_id".to_string()],
            },
        },
        // Tool 7: Get OpenSSF Scorecard
        FunctionDeclaration {
            name: "get_scorecard".to_string(),
            description: "Get OpenSSF Scorecard security metrics for a package's repository (GitHub repos). Uses package metadata to resolve the repo, then calls the Scorecard API.".to_string(),
            parameters: FunctionParameters {
                param_type: "object".to_string(),
                properties: {
                    let mut props = HashMap::new();
                    props.insert("package_id".to_string(), PropertySchema {
                        prop_type: "string".to_string(),
                        description: "The package to get scorecard for".to_string(),
                        enum_values: None,
                    });
                    props
                },
                required: vec!["package_id".to_string()],
            },
        },
        // Tool 8: Get package license info
        FunctionDeclaration {
            name: "get_license_info".to_string(),
            description: "Get license information for a package using registry metadata (best-effort). SPDX ID and flags may be unknown.".to_string(),
            parameters: FunctionParameters {
                param_type: "object".to_string(),
                properties: {
                    let mut props = HashMap::new();
                    props.insert("package_id".to_string(), PropertySchema {
                        prop_type: "string".to_string(),
                        description: "The package to analyze".to_string(),
                        enum_values: None,
                    });
                    props
                },
                required: vec!["package_id".to_string()],
            },
        },
    ]
}

// ═══════════════════════════════════════════════════════════════════════════════
// API TYPES - Request/Response structures for Gemini 3 Function Calling
// ═══════════════════════════════════════════════════════════════════════════════

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionDeclaration {
    pub name: String,
    pub description: String,
    pub parameters: FunctionParameters,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionParameters {
    #[serde(rename = "type")]
    pub param_type: String,
    pub properties: HashMap<String, PropertySchema>,
    pub required: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PropertySchema {
    #[serde(rename = "type")]
    pub prop_type: String,
    pub description: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    #[serde(rename = "enum")]
    pub enum_values: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Tool {
    function_declarations: Vec<FunctionDeclaration>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolConfig {
    function_calling_config: FunctionCallingConfig,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FunctionCallingConfig {
    mode: String, // "AUTO" | "ANY" | "NONE"
    #[serde(skip_serializing_if = "Option::is_none")]
    allowed_function_names: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentRequest {
    contents: Vec<AgentContent>,
    tools: Vec<Tool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tool_config: Option<ToolConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<AgentGenerationConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    system_instruction: Option<AgentContent>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentContent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    pub parts: Vec<AgentPart>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_call: Option<FunctionCall>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub function_response: Option<FunctionResponse>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thought_signature: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thought: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionCall {
    pub name: String,
    pub args: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FunctionResponse {
    pub name: String,
    pub response: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    thinking_config: Option<AgentThinkingConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    response_json_schema: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentThinkingConfig {
    thinking_level: String,
    include_thoughts: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentResponse {
    candidates: Option<Vec<AgentCandidate>>,
    error: Option<AgentError>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentCandidate {
    content: AgentContent,
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AgentError {
    code: i32,
    message: String,
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT STEP RESULTS - Track progress through the workflow
// ═══════════════════════════════════════════════════════════════════════════════

/// Result of a single agent step
#[derive(Debug, Clone, Serialize)]
pub struct AgentStep {
    pub step_number: usize,
    pub action: AgentAction,
    pub thought_summary: Option<String>,
    pub thought_signature: Option<String>,
}

/// What the agent decided to do
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type")]
#[allow(dead_code)]
pub enum AgentAction {
    #[serde(rename = "function_call")]
    FunctionCall {
        name: String,
        args: Value,
        result: Option<Value>,
    },
    #[serde(rename = "text_response")]
    TextResponse {
        content: String,
    },
    #[serde(rename = "error")]
    Error {
        message: String,
    },
}

/// Complete agent execution result
#[derive(Debug, Clone, Serialize)]
pub struct AgentExecutionResult {
    pub task: String,
    pub steps: Vec<AgentStep>,
    pub final_response: String,
    pub total_function_calls: usize,
    pub packages_analyzed: Vec<String>,
    pub vulnerabilities_found: Vec<VulnerabilityFinding>,
    pub recommendations: Vec<String>,
    pub structured_report: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct VulnerabilityFinding {
    pub cve_id: String,
    pub package: String,
    pub severity: String,
    pub description: String,
    pub fix_version: Option<String>,
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEMINI SECURITY AGENT
// ═══════════════════════════════════════════════════════════════════════════════

/// Autonomous Security Agent powered by Gemini 3
/// 
/// This agent can autonomously:
/// 1. Analyze dependency graphs
/// 2. Identify vulnerabilities
/// 3. Assess impact radius
/// 4. Generate SBOMs
/// 5. Evaluate compliance
/// 6. Provide remediation recommendations
pub struct GeminiSecurityAgent {
    client: Client,
    api_key: String,
    model: String,
    max_steps: usize,
}

impl GeminiSecurityAgent {
    pub fn new(api_key: String) -> Self {
        Self {
            client: Client::new(),
            api_key,
            model: "gemini-3-pro-preview".to_string(),
            max_steps: 10, // Prevent infinite loops
        }
    }
    
    #[allow(dead_code)]
    pub fn with_model(mut self, model: &str) -> Self {
        self.model = model.to_string();
        self
    }
    
    pub fn with_max_steps(mut self, max_steps: usize) -> Self {
        self.max_steps = max_steps;
        self
    }

    /// Execute an autonomous security analysis task
    #[instrument(skip(self, tool_executor))]
    pub async fn execute<F, Fut>(
        &self,
        task: &str,
        tool_executor: F,
    ) -> Result<AgentExecutionResult>
    where
        F: Fn(String, Value) -> Fut + Send + Sync,
        Fut: std::future::Future<Output = Result<Value>> + Send,
    {
        let no_step: Option<&fn(AgentStep)> = None;
        self.execute_internal(task, tool_executor, no_step).await
    }

    /// Execute with a callback invoked for each step (for streaming UIs)
    #[instrument(skip(self, tool_executor, on_step))]
    pub async fn execute_with_callback<F, Fut, Cb>(
        &self,
        task: &str,
        tool_executor: F,
        on_step: Cb,
    ) -> Result<AgentExecutionResult>
    where
        F: Fn(String, Value) -> Fut + Send + Sync,
        Fut: std::future::Future<Output = Result<Value>> + Send,
        Cb: Fn(AgentStep) + Send + Sync,
    {
        self.execute_internal(task, tool_executor, Some(&on_step)).await
    }

    async fn execute_internal<F, Fut, Cb>(
        &self,
        task: &str,
        tool_executor: F,
        on_step: Option<&Cb>,
    ) -> Result<AgentExecutionResult>
    where
        F: Fn(String, Value) -> Fut + Send + Sync,
        Fut: std::future::Future<Output = Result<Value>> + Send,
        Cb: Fn(AgentStep) + Send + Sync,
    {
        info!("Starting autonomous security analysis: {}", task);
        
        let mut steps: Vec<AgentStep> = Vec::new();
        let mut conversation: Vec<AgentContent> = Vec::new();
        let mut packages_analyzed: Vec<String> = Vec::new();
        let mut vulnerabilities_found: Vec<VulnerabilityFinding> = Vec::new();
        
        // System instruction for the Security Agent
        let system_instruction = AgentContent {
            role: Some("system".to_string()),
            parts: vec![AgentPart {
                text: Some(SECURITY_AGENT_SYSTEM_PROMPT.to_string()),
                function_call: None,
                function_response: None,
                thought_signature: None,
                thought: None,
            }],
        };
        
        // Initial user message
        conversation.push(AgentContent {
            role: Some("user".to_string()),
            parts: vec![AgentPart {
                text: Some(task.to_string()),
                function_call: None,
                function_response: None,
                thought_signature: None,
                thought: None,
            }],
        });
        
        let tools = vec![Tool {
            function_declarations: get_security_agent_tools(),
        }];
        
        // Agent loop - continue until we get a final response or hit max steps
        for step_num in 1..=self.max_steps {
            info!("Agent step {}/{}", step_num, self.max_steps);
            
            let response = self.call_gemini(&conversation, &tools, Some(&system_instruction)).await?;
            
            // Process the response
            let candidate = response.candidates
                .as_ref()
                .and_then(|c| c.first())
                .context("No response from Gemini")?;
            
            let mut function_calls: Vec<FunctionCall> = Vec::new();
            let mut text_response: Option<String> = None;
            let mut thought_summary: Option<String> = None;
            let mut thought_signature: Option<String> = None;
            
            for part in &candidate.content.parts {
                // Capture thought signature for continuity
                if let Some(sig) = &part.thought_signature {
                    thought_signature = Some(sig.clone());
                }
                
                // Capture thought summary
                if part.thought == Some(true) {
                    if let Some(text) = &part.text {
                        thought_summary = Some(text.clone());
                    }
                }
                
                // Check for function calls
                if let Some(fc) = &part.function_call {
                    function_calls.push(fc.clone());
                }
                
                // Check for text response (not thought)
                if part.thought != Some(true) {
                    if let Some(text) = &part.text {
                        text_response = Some(text.clone());
                    }
                }
            }
            
            // Add model's response to conversation (preserve thought signatures!)
            conversation.push(candidate.content.clone());
            
            // If we have function calls, execute them
            if !function_calls.is_empty() {
                let mut function_responses: Vec<AgentPart> = Vec::new();
                
                for fc in &function_calls {
                    info!("Executing tool: {}({:?})", fc.name, fc.args);
                    
                    // Track packages being analyzed
                    if let Some(pkg_id) = fc.args.get("package_id").and_then(|v| v.as_str()) {
                        if !packages_analyzed.contains(&pkg_id.to_string()) {
                            packages_analyzed.push(pkg_id.to_string());
                        }
                    }
                    
                    // Execute the tool
                    let result = tool_executor(fc.name.clone(), fc.args.clone()).await;
                    
                    let response_value = match result {
                        Ok(v) => {
                            // Extract vulnerabilities if this was a vuln check
                            if fc.name == "get_vulnerabilities" {
                                if let Some(vulns) = v.get("vulnerabilities").and_then(|v| v.as_array()) {
                                    for vuln in vulns {
                                        if let (Some(cve), Some(sev)) = (
                                            vuln.get("cve_id").and_then(|v| v.as_str()),
                                            vuln.get("severity").and_then(|v| v.as_str()),
                                        ) {
                                            vulnerabilities_found.push(VulnerabilityFinding {
                                                cve_id: cve.to_string(),
                                                package: fc.args.get("package_id")
                                                    .and_then(|v| v.as_str())
                                                    .unwrap_or("unknown")
                                                    .to_string(),
                                                severity: sev.to_string(),
                                                description: vuln.get("description")
                                                    .and_then(|v| v.as_str())
                                                    .unwrap_or("")
                                                    .to_string(),
                                                fix_version: vuln.get("fix_version")
                                                    .and_then(|v| v.as_str())
                                                    .map(|s| s.to_string()),
                                            });
                                        }
                                    }
                                }
                            }
                            v
                        }
                        Err(e) => {
                            warn!("Tool execution failed: {}", e);
                            json!({ "error": e.to_string() })
                        }
                    };
                    
                    function_responses.push(AgentPart {
                        text: None,
                        function_call: None,
                        function_response: Some(FunctionResponse {
                            name: fc.name.clone(),
                            response: json!({ "result": response_value }),
                        }),
                        thought_signature: None,
                        thought: None,
                    });
                    
                    let step = AgentStep {
                        step_number: step_num,
                        action: AgentAction::FunctionCall {
                            name: fc.name.clone(),
                            args: fc.args.clone(),
                            result: Some(response_value),
                        },
                        thought_summary: thought_summary.clone(),
                        thought_signature: thought_signature.clone(),
                    };
                    if let Some(cb) = on_step {
                        cb(step.clone());
                    }
                    steps.push(step);
                }
                
                // Add function responses to conversation
                conversation.push(AgentContent {
                    role: Some("user".to_string()),
                    parts: function_responses,
                });
            } else if let Some(text) = text_response {
                // No function calls - this is the final response
                let step = AgentStep {
                    step_number: step_num,
                    action: AgentAction::TextResponse {
                        content: text.clone(),
                    },
                    thought_summary,
                    thought_signature,
                };
                if let Some(cb) = on_step {
                    cb(step.clone());
                }
                steps.push(step);
                
                // Extract recommendations from the response
                let recommendations = self.extract_recommendations(&text);
                
                // Calculate total function calls before moving steps
                let total_function_calls = steps.iter()
                    .filter(|s| matches!(s.action, AgentAction::FunctionCall { .. }))
                    .count();

                // Generate a structured JSON report using Gemini 3 structured outputs
                let structured_report = match self
                    .generate_structured_report(
                        &text,
                        &packages_analyzed,
                        &vulnerabilities_found,
                        &recommendations,
                    )
                    .await
                {
                    Ok(report) => Some(report),
                    Err(e) => {
                        warn!(error = %e, "Structured report generation failed");
                        None
                    }
                };
                
                return Ok(AgentExecutionResult {
                    task: task.to_string(),
                    steps,
                    final_response: text,
                    total_function_calls,
                    packages_analyzed,
                    vulnerabilities_found,
                    recommendations,
                    structured_report,
                });
            }
            
            // Check finish reason
            if candidate.finish_reason.as_deref() == Some("STOP") && function_calls.is_empty() {
                break;
            }
        }
        
        // If we hit max steps, return what we have
        warn!("Agent reached max steps limit");
        
        // Calculate total function calls before moving steps
        let total_function_calls = steps.iter()
            .filter(|s| matches!(s.action, AgentAction::FunctionCall { .. }))
            .count();
        
        Ok(AgentExecutionResult {
            task: task.to_string(),
            steps,
            final_response: "Analysis incomplete - reached maximum steps".to_string(),
            total_function_calls,
            packages_analyzed,
            vulnerabilities_found,
            recommendations: vec![],
            structured_report: None,
        })
    }
    
    async fn call_gemini(
        &self,
        conversation: &[AgentContent],
        tools: &[Tool],
        system_instruction: Option<&AgentContent>,
    ) -> Result<AgentResponse> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            self.model
        );
        
        let request = AgentRequest {
            contents: conversation.to_vec(),
            tools: tools.to_vec(),
            tool_config: Some(ToolConfig {
                function_calling_config: FunctionCallingConfig {
                    mode: "AUTO".to_string(),
                    allowed_function_names: None,
                },
            }),
            generation_config: Some(AgentGenerationConfig {
                thinking_config: Some(AgentThinkingConfig {
                    thinking_level: "high".to_string(),
                    include_thoughts: true,
                }),
                temperature: Some(1.0), // Recommended for Gemini 3
                max_output_tokens: Some(8192),
                response_mime_type: None,
                response_json_schema: None,
            }),
            system_instruction: system_instruction.cloned(),
        };
        
        debug!("Calling Gemini API: {}", url);
        
        let response = self.client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
            .json(&request)
            .send()
            .await
            .context("Failed to call Gemini API")?;
        
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            error!("Gemini API error: {} - {}", status, text);
            return Err(anyhow::anyhow!("Gemini API error: {} - {}", status, text));
        }
        
        let body: AgentResponse = response.json().await
            .context("Failed to parse Gemini response")?;
        
        if let Some(err) = body.error {
            return Err(anyhow::anyhow!("Gemini error: {} - {}", err.code, err.message));
        }
        
        Ok(body)
    }

    async fn generate_structured_report(
        &self,
        final_response: &str,
        packages_analyzed: &[String],
        vulnerabilities_found: &[VulnerabilityFinding],
        recommendations: &[String],
    ) -> Result<Value> {
        let url = format!(
            "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent",
            self.model
        );

        let schema = json!({
            "type": "object",
            "properties": {
                "executive_summary": { "type": "string", "description": "2-3 sentence summary of key findings" },
                "risk_assessment": {
                    "type": "object",
                    "properties": {
                        "critical": { "type": "integer" },
                        "high": { "type": "integer" },
                        "medium": { "type": "integer" },
                        "low": { "type": "integer" }
                    },
                    "required": ["critical", "high", "medium", "low"]
                },
                "top_vulnerabilities": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "cve_id": { "type": "string" },
                            "package": { "type": "string" },
                            "severity": { "type": "string" },
                            "fix_version": { "type": ["string", "null"] }
                        },
                        "required": ["cve_id", "package", "severity"]
                    },
                    "maxItems": 5
                },
                "recommendations": {
                    "type": "array",
                    "items": { "type": "string" },
                    "maxItems": 10
                },
                "packages_analyzed": {
                    "type": "array",
                    "items": { "type": "string" }
                }
            },
            "required": ["executive_summary", "risk_assessment", "top_vulnerabilities", "recommendations", "packages_analyzed"]
        });

        let prompt = format!(
            "Generate a JSON security report from the analysis below. Use only the provided schema.\n\nAnalysis:\n{}\n\nPackages: {:?}\nVulnerabilities: {:?}\nRecommendations: {:?}",
            final_response, packages_analyzed, vulnerabilities_found, recommendations
        );

        let request = AgentRequest {
            contents: vec![AgentContent {
                role: Some("user".to_string()),
                parts: vec![AgentPart {
                    text: Some(prompt),
                    function_call: None,
                    function_response: None,
                    thought_signature: None,
                    thought: None,
                }],
            }],
            tools: vec![],
            tool_config: None,
            generation_config: Some(AgentGenerationConfig {
                thinking_config: None,
                temperature: Some(1.0),
                max_output_tokens: Some(1024),
                response_mime_type: Some("application/json".to_string()),
                response_json_schema: Some(schema),
            }),
            system_instruction: None,
        };

        let response = self.client
            .post(&url)
            .header("x-goog-api-key", &self.api_key)
            .json(&request)
            .send()
            .await
            .context("Failed to call Gemini for structured report")?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(anyhow::anyhow!("Gemini structured report error: {} - {}", status, text));
        }

        let body: AgentResponse = response.json().await
            .context("Failed to parse structured report response")?;

        if let Some(err) = body.error {
            return Err(anyhow::anyhow!("Gemini structured report error: {} - {}", err.code, err.message));
        }

        let candidate = body.candidates
            .as_ref()
            .and_then(|c| c.first())
            .context("No structured report candidate")?;

        let mut json_text = None;
        for part in &candidate.content.parts {
            if let Some(text) = &part.text {
                json_text = Some(text.clone());
                break;
            }
        }

        let json_text = json_text.context("Structured report missing text")?;
        let report: Value = serde_json::from_str(&json_text)
            .context("Failed to parse structured report JSON")?;
        Ok(report)
    }
    
    fn extract_recommendations(&self, text: &str) -> Vec<String> {
        let mut recommendations = Vec::new();
        
        // Simple extraction - look for recommendation patterns
        for line in text.lines() {
            let line = line.trim();
            if line.starts_with("- ") || line.starts_with("* ") || line.starts_with("• ") {
                if line.to_lowercase().contains("upgrade") ||
                   line.to_lowercase().contains("update") ||
                   line.to_lowercase().contains("replace") ||
                   line.to_lowercase().contains("remove") ||
                   line.to_lowercase().contains("consider") ||
                   line.to_lowercase().contains("recommend") {
                    recommendations.push(line[2..].trim().to_string());
                }
            }
            // Numbered recommendations
            if line.len() > 2 && line.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                if let Some(rest) = line.get(2..) {
                    if rest.starts_with(". ") || rest.starts_with(") ") {
                        recommendations.push(rest[2..].trim().to_string());
                    }
                }
            }
        }
        
        recommendations
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT - The agent's personality and instructions
// ═══════════════════════════════════════════════════════════════════════════════

const SECURITY_AGENT_SYSTEM_PROMPT: &str = r#"You are an expert Supply Chain Security Agent powered by Gemini 3. Your role is to autonomously analyze software dependency graphs for security vulnerabilities, compliance issues, and supply chain risks.

## Your Capabilities
You have access to the following tools:
1. `search_packages` - Find packages in the dependency graph
2. `get_vulnerabilities` - Check for CVEs and security advisories
3. `get_dependency_path` - Trace how vulnerable packages reach a project
4. `get_impact_radius` - Assess blast radius of vulnerabilities
5. `generate_sbom` - Create Software Bill of Materials
6. `evaluate_policy` - Check compliance with security policies
7. `get_scorecard` - Get OpenSSF Scorecard metrics
8. `get_license_info` - Check license compliance

## Your Workflow
When analyzing a project or package, follow this systematic approach:

### Phase 1: Discovery
- Search for the target package(s)
- Map direct and transitive dependencies
- Identify the ecosystem and version constraints

### Phase 2: Vulnerability Assessment
- Check each critical dependency for known CVEs
- Prioritize by severity (Critical > High > Medium > Low)
- Identify dependency paths from the root to vulnerable packages

### Phase 3: Impact Analysis
- Calculate the blast radius for each vulnerability
- Determine if vulnerabilities are reachable
- Assess the likelihood and impact of exploitation

### Phase 4: Compliance Check
- Verify license compatibility
- Check OpenSSF Scorecard scores
- Evaluate against security policies

### Phase 5: Remediation
- Provide specific upgrade recommendations
- Suggest alternative packages if needed
- Prioritize fixes by risk and effort

## Output Format
Always provide:
1. **Executive Summary** - Key findings in 2-3 sentences
2. **Risk Assessment** - Categorized vulnerabilities
3. **Dependency Analysis** - Critical paths and relationships
4. **Recommendations** - Prioritized action items
5. **Compliance Status** - Policy evaluation results

## Important Guidelines
- Always verify findings with multiple data points
- Consider both direct and transitive dependencies
- Prioritize actionable recommendations
- Be specific about versions (e.g., "upgrade lodash from 4.17.15 to 4.17.21")
- Explain WHY a recommendation matters

You are thorough, accurate, and focused on providing actionable security insights.
"#;

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_get_security_agent_tools() {
        let tools = get_security_agent_tools();
        assert_eq!(tools.len(), 8);
        assert_eq!(tools[0].name, "search_packages");
        assert_eq!(tools[1].name, "get_vulnerabilities");
    }
    
    #[test]
    fn test_function_declaration_serialization() {
        let tools = get_security_agent_tools();
        let json = serde_json::to_string_pretty(&tools).unwrap();
        assert!(json.contains("search_packages"));
        assert!(json.contains("get_vulnerabilities"));
    }
}
