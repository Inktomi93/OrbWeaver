---
kind: work
status: doing
updated: 2026-10-13
priority: P1
area: server
lane: codex/compose-policy-995
plan: test-foundation
---

# Move administrative and refinery policies out of compose

## What

Continue compose cleanup in `packages/server/src/entry/compose/admin.ts`, `update-check.ts`, `refinery.ts` and `debug-inspectors.ts`. Move per-call decisions and queries to their real domain or transport owners. Preserve typed consumer ports and pure graph wiring.

## Why

Administrative session policy, update probing, refinery planning and recorder projections still execute rules inside composition callbacks. The real harness needs those rules reachable through their owning production operations.

## Done when

Remove the batch's compose exceptions without adding suppressions or sideways imports. Preserve privileged audit atomicity, per-user socket eviction, Principal identity, funded refinery refusals, cached update reasons and recorder filtering. Preserve meaningful cases through production tests with discriminating controls. Delete obsolete structure and type copies in the same cohesive commit. Coordinate services wiring through the primary agent.

## Evidence

Filled at landing: what ran and where its output is.
