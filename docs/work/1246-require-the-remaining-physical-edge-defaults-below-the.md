---
kind: work
status: open
updated: 2026-10-23
priority: P3
area: server
---

# Require the remaining physical-edge defaults below the root

## What

After item 1243, the one-layer-down sweep leaves three ambient defaults of the same class: `packages/server/src/domain/rpg/flush-barrier.ts:73,97` (`realScheduleTimeout` default parameter), `domain/workloads/engine/runner.ts:147-160` (`?? realScheduleInterval`), and `infra/network/egress.ts` defaulting `fetch` to `globalThis.fetch` and `resolver` to `defaultResolver` where `buildConnector` is now required. The 1243 verifier found four more of the same class: `infra/network/http-server.ts:167-174` (`drainHttpServer` defaults its scheduler to an inline `setTimeout`, and `entry/lifecycle.ts:680` passes none, so the shutdown drain arms the real timer); `infra/media/index.ts:162,193` (`createVideoPreparer` defaults to `scheduleWithTimer` and `prepareVideo` is built at module scope, so no root can supply it); `infra/plugin-host/process-runtime.ts:275` (`monotonicNow ?? performance.now`, `PluginHostSeamDeps.monotonicNow` optional, production passes none); and the optional `random` on `domain/chat/assembly/macros.ts:63,158,329`, which kit resolves as `ctx.random ?? Math.random` and which `verbs/edit.ts:308`, `verbs/read.ts:1169` and `assembly/context.ts:958` omit. The `require-seam-properties` codemod covers the interface-property cases.

## Why

Same hazard class as 1243: a direct test of these modules can still pass against the real clock or the real resolver.

## Done when

All three are required at their types and supplied by `createProcessSeams` through the root; the sweep (`createIdSource()`, `systemTimers`, `realSchedule*`, `globalThis.fetch`, `defaultResolver` under `packages/server/src` and `packages/inference/src`) names only `process-seams.ts` and the definitions; egress hunks get a security-executor read.

## Evidence

Filled at landing: what ran and where its output is.
