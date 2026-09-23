---
kind: adr
status: active
updated: 2026-09-23
---

# Provider wires stay our own adapters

## Context

Two shortcuts recur for the OpenRouter and Anthropic paths: adopting a third-party AI SDK, and routing Anthropic traffic through OpenRouter's Anthropic-shaped endpoint.

## Decision

The inference package keeps its own wire adapters behind the providers runner. We do not adopt `@tanstack/ai` for the chat path, and the Anthropic path does not use OpenRouter's Anthropic passthrough.

## Consequences

Provider fixes land in our adapters (cache control, effort translation and cost fields among them). Third-party SDKs remain reading material for wire handling.

## Alternatives rejected

- `@tanstack/ai`: a pre-1.0 SDK covering a small part of the inference package, with no Anthropic OAuth (the agent SDK backend), no embed or rerank, nothing for engine supervision, and a call-site-picks-an-adapter model that `providers-runner-seal` exists to prevent.
- OpenRouter's Anthropic endpoint: it gains native thinking blocks and more cache breakpoints, but loses provider routing, model fallback and OpenRouter cost fields, and adds a third chat dialect to maintain.
