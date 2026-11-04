---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: testing
plan: restoration-register
---

# Distinguish disabled wire capture from missing enabled capture

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`MAIN-AF3-CAPTURESKIP-001`: Preserve canonical capture enabled state through the E2E helper; skip only explicitly disabled instrumentation and require a matching capture after a successful live turn when enabled.

Inspect `tests/e2e/live-round-trip-fidelity.spec.ts`, `tests/e2e/support/trpc.ts`, `packages/server/src/foundation/observability/debug/routes.ts`, `packages/server/src/foundation/observability/debug/wire-capture.ts`.

## Why

`MAIN-AF3-CAPTURESKIP-001`: An empty array currently skips whether instrumentation is disabled or enabled but broken.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`MAIN-AF3-CAPTURESKIP-001`: Disabled control skips; enabled empty control fails with actionable chat/provider diagnostics; enabled matching control reaches existing assertions. Native checks remain owed.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
