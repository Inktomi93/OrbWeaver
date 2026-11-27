---
kind: bug
status: open
updated: 2026-11-27
priority: P3
area: inference
plan: test-foundation
---

# Own-server sampler opt-ins carry untested branches

## What

The box sampler review found branches no test fails on: two of the three vLLM bad_words keep checks (first token differs, space-led form non-empty) in backends/openai-compat/tokens.ts; the list-spelling short-circuit and the nothing-dropped turn in the phrase resolver; the refusedOwnServerFeatures filter in resolve/behave-as.ts; speakerNamesOf, the single-macro anchors in sampler-names.ts and the bus count mapping in toChatWarning; and no test sends a word-keyed bias through vllm_xargs. D359 also says every turn raises own_server_features_ignored, while Google and Anthropic connections drop the opt-ins without it.

## Why

A regression in any of these ships green, and the ADR states a warning some connections never raise.

## Done when

Each branch has a case through the composed root or the module's door that goes red when it is removed, and D359 says which connections warn, or the warning reaches every connection that drops an opt-in.

## Evidence

Filled at landing: what ran and where its output is.
