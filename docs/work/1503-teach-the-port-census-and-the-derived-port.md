---
kind: tooling
status: open
updated: 2026-10-31
priority: P2
area: architecture
---

# Teach the port census and the derived-port rule the spread flow

## What

The census and `orb/derived-port-member` read property, variable, return and argument flows but not a `{ ...ops }` spread, so a hand-restated port wired by spreading the owner's ops never reports. A probe that read spreads found restated cross-domain ops behind `SeedAvatarOps`, `GalleryCharacterOps`, `ImageryRoomAccess`, `VectorSweepOps`, `MemoryEmbeddingOps`, `PersonaSeedSettings`, `SeedOwnerContext.hashPassword` and `ChatWorkloadDeps.isMemoryEnabled`. The unwired scan already reads spreads through `spreadFlowsAt` in `tooling/src/unwired/restated-port.ts`.

## Why

A gate that cannot see a flow reports a restated port as clean, which is the defect the rule exists to refuse.

## Done when

`flowsAt` returns spread member flows, the census and the rule report the restated ops it reveals, each is derived or moved to contracts by the 1439 rulings, and `pnpm unwired ports` reports zero open targets with a planted spread-restatement case in `tests/tooling/eslint-derived-port-member.test.ts`.

## Evidence

Filled at landing: what ran and where its output is.
