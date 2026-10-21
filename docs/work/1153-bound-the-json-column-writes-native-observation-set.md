---
kind: bug
status: doing
updated: 2026-10-21
priority: P1
lane: codex/ordinary-demand-1153
plan: test-foundation
---

# Bound the json-column-writes native observation set

## What

The json-column-writes fact roots its native observation set at every call in its population, while the reader judges a small fraction of them; RSS grows roughly linearly with files (about 1.1 GB per hundred), which matches the drizzle-schema finish-phase OOM in schema-data-grants (item 1117). Narrowing the roots made tooling/src/floor/code-facts/ordinary-observations.ts refuse (normalizer facts are missing; related value is outside its closed source context), so the capture code must accept a partial root set.

## Why

The fact's memory scales with calls it never reads, which keeps the schema-data gates over the 16 GB runner (965 family).

## Done when

The observation set roots only where the reader reads; ordinary-observations accepts a partial root set with explicit unresolved results for anything outside it (D328); schema-data-grants completes under 16 GB with identical findings and a measured peak.

## Evidence

Filled at landing: what ran and where its output is.
