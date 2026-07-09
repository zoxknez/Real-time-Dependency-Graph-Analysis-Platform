# Demo Script (≈3 Minutes)

## 0:00–0:20 — Problem & Promise
- “Software supply chains are huge; one vulnerable transitive dependency can impact thousands of packages.”
- “We built an **Autonomous Security Agent** powered by **Gemini 3** to discover and explain risk in seconds.”

## 0:20–0:50 — Show the Agent UI
- Navigate to Security Dashboard → **Security Agent** tab.
- Highlight: steps timeline, tool calls, thought summaries, structured JSON report.

## 0:50–1:50 — Live Agent Run
- Prompt: “Analyze npm:lodash for vulnerabilities, show dependency path and impact radius, and recommend fixes.”
- Show tool calls firing:
  1) `search_packages`
  2) `get_dependency_path`
  3) `get_impact_radius`
  4) `get_vulnerabilities`
- Emphasize **function calling** and **thought summaries**.

## 1:50–2:25 — Structured Report
- Scroll to JSON report.
- Point to executive summary + risk counts + top vulnerabilities.
- Mention **structured outputs** for automation and dashboards.

## 2:25–2:50 — Why Gemini 3
- “Only Gemini 3 gives us the reliability for tool calling + structured outputs + high‑level reasoning.”
- “This makes it an agent, not a chatbot.”

## 2:50–3:00 — Close
- “Autonomous, explainable, and actionable security analysis — ready for real teams.”

## Optional 20s Extension (Live API)
- Open /agent-live and show Live API demo page.
- Mention ephemeral tokens and real‑time voice agent as bonus wow‑factor.
- Note: Live API demo uses a native audio model (Gemini 2.5) and is optional.

## Backup Prompts
- “Find all critical vulnerabilities in my project and list prioritized fixes.”
- “Generate SBOM for npm:express and evaluate policy compliance.”
