---
kind: tooling
status: doing
updated: 2026-11-21
priority: P3
area: tooling
lane: wt/agent-ab0da6eb717c469cb
plan: unwired-code
---

# The unwired unions scan reads fallback literals and inferred slots

## What

The unions review found false-positive classes the plan does not list: a literal in a ?? fallback (REFUSAL_KINDS.unexpected) and a slot typed through z.infer (PROMPT_CACHE_FORMATS.openai-breakpoint, RULE_PRESET_ENTITY_KINDS.worldInfoBook); and a false negative: REFINERY_ANALYZE_MODES.iteration has no producer and is not reported.

## Why

A scan that misses an unbuilt member and buries others under false rows misleads the cleanup.

## Done when

Each class has a red-first planted case in tests/tooling/unwired/unions.int.test.ts, the iteration case reports, and the orchestrator reruns pnpm unwired unions.

## Evidence

Filled at landing: what ran and where its output is.
