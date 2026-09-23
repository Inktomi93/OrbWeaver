---
kind: work
status: blocked
updated: 2026-09-23
priority: P3
area: contracts
blocked: owner
---

# Replace luxon with Temporal once Safari ships stable Temporal

## What

Swap the luxon date engine in `packages/kit/src/macro/registry.ts` for Temporal, drop luxon from `packages/kit/package.json`, and add a lint ban on importing luxon.

## Why

The Node 26 adoption deferred exactly this one change, with its trigger: the browser client imports kit, and Safari has no stable Temporal. `docs/law/Spine-TypeScript-and-Patterns.md` names it as the one deferral.

## Done when

Wake when Safari ships stable Temporal. Done when kit uses Temporal, luxon is gone from every package, and a lint rule refuses a new luxon import.

## Evidence

Filled at landing: what ran and where its output is.
