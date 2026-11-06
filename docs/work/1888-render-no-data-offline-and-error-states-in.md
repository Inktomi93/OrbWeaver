---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: client
plan: test-foundation
---

# Render no-data offline and error states in unselected content panes

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B012-finding-362`: Give Databank and Plugin pages no-selection branches visible owned state when their first data is unavailable; retain selected-page error handling and readiness semantics.

Inspect `tests/client/features/app-shell/surfaces/platform-overflow-room.suite.ct.tsx`, `tests/client/features/app-shell/surfaces/section-swap-ready.ct.tsx`, `packages/client/src/features/databank/surfaces/databank-detail-surface.tsx`, `packages/client/src/data/query-client.ts`.

## Why

`AF3-B012-finding-362`: Current no-data branches can declare ready while rendering no body; the offline CT checks only readiness and opacity.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B012-finding-362`: Cold uncached paused/failed-read cases observe visible state and recovery, with normal loaded counterparts. No broad all-offline-navigation claim.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
