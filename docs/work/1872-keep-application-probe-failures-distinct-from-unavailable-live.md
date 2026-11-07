---
kind: work
status: doing
updated: 2026-11-07
priority: P2
area: testing
lane: wt/agent-af0eb63da78e0d44e
plan: test-foundation
---

# Keep application probe failures distinct from unavailable live backends

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`MAIN-AF3-LIVEPROBE-001`: Skip only for explicit configuration or external transport unavailability in group and guided probes. Propagate application failures and missing required greeting state.

Inspect `tests/e2e/live-group-modes.spec.ts`, `tests/e2e/guided-generations.spec.ts`, `tests/e2e/support/trpc.ts`.

## Why

`MAIN-AF3-LIVEPROBE-001`: Broad probe catches can skip dependent live cases when application behavior fails before their assertions run.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`MAIN-AF3-LIVEPROBE-001`: Unavailable-backend controls skip with a reason. Product failures fail instead of skipping. Preserve mode, variant, continuation and speaker assertions.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
