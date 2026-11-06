---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: client
plan: test-foundation
---

# Observe newer mutation success before releasing the older failure

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B010-finding-533`: Replace the fixed400ms pause in superseded-writes CT with an observable successful second client mutation before failing the held first request.

Inspect `tests/client/data/superseded-writes.ct.tsx`, `tests/client/data/_superseded-writes-stories.tsx`, `packages/client/src/data/create-entity-mutation.ts`, `packages/client/src/data/query-client.ts`.

## Why

`AF3-B010-finding-533`: Elapsed time and request dispatch do not establish the newer-success precondition named by the test. A still-pending newer request can satisfy the existing toast assertion.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B010-finding-533`: Focused cold CT passes; withholding second success prevents the test from advancing to the older failure. Preserve the separate clearError case and exact toast assertion.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
