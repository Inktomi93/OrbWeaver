---
kind: adr
status: active
updated: 2026-09-30
supersedes: docs/adr/0256-google-limits-stay-curated.md
---

# Native Google inference uses the shared runtime

## Context

Gemini requires a first-class native provider with faithful tool signatures and supported model operations.

## Decision

The google provider uses a native Google wire inside @orb/inference, implemented with @ai-sdk/google. Existing callers use the shared task contracts. Native model discovery supplies supported model facts; curated and declared evidence retain their established precedence. The custom OpenAI-compatible route remains supported, including signed tool-call follow-up. Compatibility-route limits use curated rows; OpenRouter uses advertised facts. Declared capability remains the top tier. Opaque transport signatures stay out of public tool records.

## Consequences

Implement the existing chat, summary, structured, embedding and image task surfaces that Google supports. Unsupported tasks remain absent. Keep resolution, credentials, normalization, embedding-space identity and reindex behavior in their existing owners.

## Alternatives rejected

Requiring every Google user to configure a custom compatibility endpoint omits the native provider integration. Adding provider-specific branches to application callers duplicates runtime responsibility.
