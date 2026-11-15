---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# Anthropic fallback entries drop thinking and output_config without a warning

## What

The `fallbacks` schema in `packages/inference/src/backends/anthropic-messages/extras.ts` names `model`, `max_tokens` and `speed`, while the installed `@ai-sdk/anthropic` types a fallback entry with `thinking` and `output_config` as well. Both are stripped from a connection's fallback entries before the extras reach the provider, with no `custom_parameters_ignored` warning; any other unknown key inside the block is dropped the same silent way.

## Why

The file's posture is that a refused extras key is reported. A user who sets a fallback's thinking or output config sees it vanish and reads it as the provider ignoring the setting.

## Done when

The fallback schema matches the installed SDK's fallback entry, and a key it does not name is either refused with a `custom_parameters_ignored` warning or kept; a test sends a fallback entry with `thinking` and asserts it reaches the provider options.

## Evidence

Filled at landing: what ran and where its output is.
