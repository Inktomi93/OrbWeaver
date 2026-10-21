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

The reviewed bounded capture repair is integrated at `75c9540c00`. Scoped behavior and affected native compiler checks pass. Evidence: `reports/review/1153-ordinary-demand-review.md`.

Real schema-data-grants, complete policy authority and measured memory qualification remain open. Source integration does not establish those outcomes.

The repaired capture still exceeds the aggregate memory budget during actual complete-policy qualification. The stopped run supplies no owner or authority verdict. Evidence: `reports/review/1153-real-policy-resource-failure.md`.
