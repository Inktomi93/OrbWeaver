---
kind: tooling
status: doing
updated: 2026-11-27
priority: P3
area: tooling
lane: wt/agent-a1902dde200366c39
---

# A seeding snap run refuses a stage another checkout already holds

## What

A checkout already attached to a stage before pnpm snap --stage-connection seeds it keeps using that stage, so its turns spend the seeded key; the seed mark is also written under a second lock after allocation (tooling/src/snap/ops/stage-census.ts, stage.ts).

## Why

A sibling lane can spend a key it never asked for.

## Done when

Inside the allocation lock, a seeding run refuses with StageBusyError when a foreign holder or session is live and otherwise writes the mark, with a red-first case in tests/tooling/snap/lib/stage-bands.test.ts.

## Evidence

Filled at landing: what ran and where its output is.
