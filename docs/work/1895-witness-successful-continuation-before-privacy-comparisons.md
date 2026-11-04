---
kind: work
status: open
updated: 2026-11-03
priority: P2
area: testing
plan: restoration-register
---

# Witness successful continuation before privacy comparisons

## What

Revalidate the cited source on live main before deciding the finding. Preserve existing coverage and governing decisions.

`AF3-B032-Q002`: Require unaborted continuation and independent second-tail host/native evidence before retaining exact member-prefix assertions.

Inspect `tests/server/domain/chat/substrate/member-visibility.int.test.ts`, `tests/server/domain/chat/engine/core-physical.ts`, `packages/server/src/domain/chat/substrate/member-visibility.ts`, `packages/server/src/domain/chat/verbs/turn.ts`.

## Why

`AF3-B032-Q002`: Both privacy expectations can be supplied by the first turn when the prepared continuation reply is never consumed.

## Done when

Record a confirmed, corrected or retracted judgment for each finding. Confirmed issues need a correction and affected native validation.

`AF3-B032-Q002`: A no-op/aborted continuation control fails the new positive witness; current native continuation passes.

## Evidence

Source assessment: `af3fba26a9805a1833b64010a99ceb84f6298dd3`. The cited findings are accepted source observations, not runtime reproductions. Revalidate live source and record native results or counterevidence here.
