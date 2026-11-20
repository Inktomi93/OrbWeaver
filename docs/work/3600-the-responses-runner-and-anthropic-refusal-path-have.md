---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: inference
---

# The responses runner and anthropic refusal path have tests and comments that match the code

## What

tests/inference/backends/openai-compat/responses-turn.int.test.ts pins the dropped-sampler knob for topK only, so removing the knob from the thinkingBudgetTokens and samplerOrder drops stays green; add a case for each. packages/inference/src/backends/anthropic-messages/refusal.ts still describes caller-requested fallbacks, which the anthropic extras ban removed; the fallback branch is likely unreachable now, so close it with a type or delete it and fix the comment.

## Why

A knob that only one case proves can regress unseen, and a comment that describes a removed path sends the next author into dead code.

## Done when

Removing knob from any responses-runner drop turns a test red; refusal.ts names no caller-requested fallback and has no unreachable branch.

## Evidence

Filled at landing: what ran and where its output is.
