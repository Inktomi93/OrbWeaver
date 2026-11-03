---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: testing
plan: restoration-register
---

# Adopt the embedding rebuild test database before constructing its harness

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B023-finding-002`: Register closeDb on twoEncoders caller AsyncDisposableStack after freshDb resolves and before awaiting createServerHarness, preserving graph-before-DB LIFO teardown.

Inspect `tests/server/domain/connection/verbs/embed-space-rebuild.int.test.ts`, `tests/support/node/server.ts`.

## Why

`AF3-B023-finding-002`: This helper owns its freshly created DB but supplies it through a borrowing seam and only adopts the returned root, leaving both success and later construction refusal without deterministic DB cleanup.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B023-finding-002`: Four embedding-space rebuild cases preserve their assertions and deterministic DB closure on successful teardown and harness construction refusal. Native checks remain owed; no measured leak claimed.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
