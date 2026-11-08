---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tooling
---

# Scrub Playwright-truncated text in snap traces

## What

Playwright truncates element text in trace.trace before the value scrub runs, so a token prefix survives in the trace.

## Why

Scrubbing by full value misses the truncated prefix on private runs.

## Done when

Trace text is scrubbed by prefix match for noted secrets, or traces from private runs are refused, with a red-first canary.

## Evidence

Filled at landing: what ran and where its output is.
