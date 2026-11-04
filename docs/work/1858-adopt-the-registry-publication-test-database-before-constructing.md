---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: testing
plan: restoration-register
---

# Adopt the registry-publication test database before constructing its harness

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B023-finding-001`: Register closeDb on rooted caller AsyncDisposableStack immediately after freshDb resolves, then adopt the constructed server root so graph teardown precedes DB closure.

Inspect `tests/server/domain/connection/persistence/registry-publication-order.int.test.ts`, `tests/support/node/server.ts`, `packages/server/src/entry/compose/services.ts`.

## Why

`AF3-B023-finding-001`: The server harness intentionally borrows supplied databases; adopting only the harness leaves the test-created DB without deterministic cleanup on success or subsequent construction failure.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B023-finding-001`: Normal teardown and harness-construction refusal close the supplied DB after graph settlement; affected native registry tests pass. No driver-GC or measured leak claim.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
