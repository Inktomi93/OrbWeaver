---
kind: work
status: open
updated: 2026-10-02
priority: P3
area: embeddings
---

# Remove the obsolete embedding-space fold

## What

Remove foldActiveSpace and its unused CompletedSpaceRow and ActiveSpace contracts. Keep VECTOR_SCOPES_BY_TASK and the immutable-generation reader and promotion logic.

## Why

Only contract tests call the string-space fold. Product search uses readGeneration and atomic generation promotion, so the old fold describes a different completion model.

## Done when

Confirm consumers with structural and literal searches. Remove the unused fold and coupled obsolete tests. Correct comments that describe the string-space getter. Preserve and run active-generation, incomplete-build, task-isolation and promotion-race tests. Do not weaken retrieval provenance or change persisted data.

## Evidence

The candidate is in `reports/launch-ast-audit-2026-10-01/rot-contracts.json`; the independent literal sweep is `reports/launch-ast-audit-2026-10-01/testonly-literal-crosscheck.txt`. The replacement reader is `packages/server/src/domain/search/persistence/active-space.ts`. Promotion is in `packages/server/src/domain/embeddings/persistence/space-state.ts`. Existing behavior assertions are in `tests/server/domain/search/persistence/active-space.int.test.ts`.
