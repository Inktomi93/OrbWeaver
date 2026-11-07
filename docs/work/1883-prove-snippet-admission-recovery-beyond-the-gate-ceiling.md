---
kind: work
status: doing
updated: 2026-11-07
priority: P2
area: testing
lane: wt/agent-af0eb63da78e0d44e
plan: test-foundation
---

# Prove snippet admission recovery beyond the gate ceiling

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B032-Q001`: Make enough sequential controlled failed owner attempts to exceed the real ceiling, observing the expected spawn refusal each time; retain foreign zero-spawn control.

Inspect `tests/support/node/plugin-lifetime.int.test.ts`, `packages/server/src/domain/plugin/substrate/snippet-gate.ts`, `packages/server/src/domain/plugin/verbs/run-snippet.ts`, `packages/server/src/entry/compose/automation-plugin.ts`.

## Why

`AF3-B032-Q001`: Two attempts cannot expose leaked admission slots under a four-slot cap.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B032-Q001`: Removing release fails the maintained native case; the current finally release passes. No new static scanner.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
