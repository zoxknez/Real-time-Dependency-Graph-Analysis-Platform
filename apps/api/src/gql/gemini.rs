use async_graphql::{Context, Object, Result, ID};
use tracing::instrument;

use crate::gql::context::GqlContext;

#[derive(Default)]
pub struct GeminiQuery;

#[Object]
impl GeminiQuery {
    /// Explain the dependency graph for a given package
    #[instrument(skip(self, ctx))]
    async fn explain_dependency_graph(
        &self,
        ctx: &Context<'_>,
        package_id: ID,
    ) -> Result<String> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        let prompt = format!(
            "Explain the dependency graph and potential risks for package: {}",
            package_id.as_str()
        );
        
        let response = gql_ctx.gemini.generate_content(&prompt).await?;
        Ok(response)
    }

    /// Ask a free-form question to Gemini about the package ecosystem
    #[instrument(skip(self, ctx))]
    async fn ask_gemini(
        &self,
        ctx: &Context<'_>,
        question: String,
        context_packages: Vec<ID>,
    ) -> Result<String> {
        let gql_ctx = ctx.data::<GqlContext>()?;
        
        // Build rich context - simplified version that works
        let mut context_parts = Vec::new();
        
        if !context_packages.is_empty() {
            context_parts.push("Analyzing the following packages:".to_string());
            for package_id in &context_packages {
                context_parts.push(format!("- {}", package_id.as_str()));
            }
        }
        
        // Build final prompt with rich context and thinking mode enabled
        let context_str = if context_parts.is_empty() {
            "General dependency ecosystem question.".to_string()
        } else {
            context_parts.join("\n")
        };
        
        let prompt = format!(
            "You are an expert software dependency analyst with deep knowledge of package ecosystems (npm, PyPI, Cargo, etc.), version management, and software architecture.\n\n\
            CONTEXT:\n{}\n\n\
            USER QUESTION: {}\n\n\
            Please provide a detailed, thoughtful analysis using your thinking capabilities. Consider:\n\
            - Transitive dependency impacts and cascading effects\n\
            - Potential breaking changes across semantic versions\n\
            - Security implications and vulnerability propagation\n\
            - Best practices for dependency management in production systems\n\
            - Specific actionable recommendations for this situation\n\
            - Risk assessment and mitigation strategies\n\n\
            Think through the problem step by step, showing your reasoning process.",
            context_str, question
        );

        let response = gql_ctx.gemini.generate_content(&prompt).await?;
        Ok(response)
    }
}
