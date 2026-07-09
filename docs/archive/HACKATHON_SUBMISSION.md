# Gemini 3 Hackathon Submission

Last updated: 2026-02-03

## Project Title
Autonomous Supply Chain Security Agent

## 200-Word Gemini Integration Summary
Our application uses Gemini 3 as the autonomous reasoning engine for a supply-chain security agent that analyzes dependency graphs at scale. The agent decomposes a security task, plans a multi-step workflow, and calls tools to search packages, trace dependency paths, compute impact radius, and fetch vulnerabilities. We use Gemini 3 function calling to connect the model to real graph queries and OSV data, ensuring each claim is grounded in evidence. The agent runs at high thinking level for complex reasoning and returns thought summaries so users can audit why each step was chosen. For automation, we use Gemini 3 structured outputs to emit a strict JSON report with an executive summary, risk counts, top vulnerabilities, and prioritized remediation steps. The UI streams each tool call in real time, highlights reasoning summaries, and renders the final JSON for dashboards and workflows. We also use Gemini 3 Flash for fast explanations and Gemini 3 Pro for deep analysis, keeping latency low without sacrificing accuracy. Gemini 3 is central to the product's differentiation: without reliable tool calling, thought summaries, and schema-constrained output, the system could not execute or verify end-to-end security workflows. It turns static dependency data into actionable security decisions for teams.

## Public Links
- Demo URL: REQUIRED (add public link)
- Code Repository: REQUIRED (add public link)
- Video (approx 3 minutes): REQUIRED (add public link, English or English subtitles)
- Test Credentials: REQUIRED if login is needed (otherwise write "Not required")

## Gemini 3 Features Used
- Function Calling (custom tools)
- Thinking Level: high
- Thought Summaries
- Structured Outputs (JSON schema)

## Optional Live API Demo
We include an optional Gemini Live API voice demo to show low-latency streaming. The Live demo uses a native audio model and is presented as a bonus, while the core submission and judging criteria focus on Gemini 3 agent capabilities.

## How to Run
See README.md for setup instructions.
