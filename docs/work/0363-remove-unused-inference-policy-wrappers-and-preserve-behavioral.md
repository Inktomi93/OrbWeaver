---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: inference
---

# Remove unused inference policy wrappers and preserve behavioral proof

## What

Remove evidenceRank and taskProviders if the complete consumer check confirms their test-only status. Keep the live evidence vocabulary, capability synthesis, providerTasks, connectionTasks and funding policy.

Remove the test-only `DEFAULT_EMBED_MODEL` and `DEFAULT_RERANK_MODEL` production aliases and their barrel exports. Keep `LOCAL_LIGHT_SEED_ROWS` as the seed policy.

## Why

Both helpers have only test callers. Capability synthesis states its precedence directly rather than calling evidenceRank, and the shipped picker does not call taskProviders. Comments and helper tests imply runtime wiring that does not exist.

The default-model aliases are read by fixtures, while actual seeding reads the canonical contract rows. Curated provenance strings also cite these aliases through nonexistent backend files.

## Done when

Confirm structural and literal consumers, including barrels and aliases. Preserve provider task eligibility assertions against the live provider policy. Preserve capability precedence and warning assertions against actual synthesis, not an unused index helper. Correct misleading comments and run affected focused suites. Do not change provider offerings or precedence rules.

Move default-model fixture consumers to canonical seed rows or test-owned projections. Preserve catalog, prefetch, seed and embedding-space agreement assertions. Correct the curated provenance citations without changing capability values or seeded models. Keep the dynamically loaded `createModelCache` factory; its worker calls are live.

## Evidence

Filled at landing: what ran and where its output is.
