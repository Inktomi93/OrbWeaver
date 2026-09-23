---
kind: adr
status: active
updated: 2026-09-23
---

# Anthropic API-key inference is a provider row

## Context

Not recorded in the ledger row.

## Decision

First-party Anthropic API-key inference is the `anthropic` provider row on the `anthropic-messages` API and wire. Its backend uses `@ai-sdk/anthropic` for direct chat, summarize, and structured turns; it is separate from the `agent-sdk` subscription wire and has no Claude Code subprocess/session semantics. Homes: `@orb/contracts/inference` built-in provider/API/wire registries · `@orb/inference/backends/anthropic-messages`.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
