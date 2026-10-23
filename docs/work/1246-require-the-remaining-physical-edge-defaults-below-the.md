---
kind: work
status: open
updated: 2026-10-23
priority: P3
area: server
---

# Require the remaining physical-edge defaults below the root

## What

After item 1243, the one-layer-down sweep leaves three ambient defaults of the same class: `packages/server/src/domain/rpg/flush-barrier.ts:73,97` (`realScheduleTimeout` default parameter), `domain/workloads/engine/runner.ts:147-160` (`?? realScheduleInterval`), and `infra/network/egress.ts` defaulting `fetch` to `globalThis.fetch` and `resolver` to `defaultResolver` where `buildConnector` is now required. The `require-seam-properties` codemod covers the interface-property cases.

## Why

Same hazard class as 1243: a direct test of these modules can still pass against the real clock or the real resolver.

## Done when

All three are required at their types and supplied by `createProcessSeams` through the root; the sweep (`createIdSource()`, `systemTimers`, `realSchedule*`, `globalThis.fetch`, `defaultResolver` under `packages/server/src` and `packages/inference/src`) names only `process-seams.ts` and the definitions; egress hunks get a security-executor read.

## Evidence

Filled at landing: what ran and where its output is.
