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

The lane implements owner factories for admin sessions and card embedding, refinery planning, settings update policy, upstream I/O and transport recorder projections. Preserve audit atomicity, live funding resolution and recorder filtering. Shared services, owner exports and package doors require coordinated integration.

The card-store port must not import the embeddings service facade. Put its data-only input and result in contracts; derive the domain params with the existing abort field. Contracts remains DOM/node-free. The affected compiler programs and native import graph must confirm this correction before review.

The selected policy run withholds entire-population policies; it does not prove them clean. Defer those policies to main-owned verification without expanding the lane floor. The corpus item owns the unavailable production-derived recall seed; do not fabricate a trace to satisfy strict reach.
