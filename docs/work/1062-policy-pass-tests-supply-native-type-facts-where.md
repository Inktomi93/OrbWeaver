---
kind: tooling
status: open
updated: 2026-10-18
priority: P2
area: tooling
plan: test-foundation
---

# Policy-pass tests supply native type facts where their facts need them

## What

Many files under tests/tooling call runPolicyPass without mentioning nativeTypeFacts (claude-b's sweep after 1054; the candidate list is in that lane's report). Where a test exercises a types-analysis fact, the pass refuses or never runs the producer, so the test may pass without proving anything. Some supply the context through a shared helper or never run a types fact.

## Why

1054 showed this exact pattern hiding real failures; a policy test whose fact never runs proves nothing.

## Done when

Each listed file is classified with evidence; tests that need the context supply it and assert the producer ran (red-first where a test was silently passing); the rest are recorded as not needing it.

## Evidence

Filled at landing: what ran and where its output is.
