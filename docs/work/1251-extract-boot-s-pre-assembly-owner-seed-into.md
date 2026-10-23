---
kind: work
status: open
updated: 2026-10-23
priority: P3
area: server
---

# Extract boot's pre-assembly owner seed into one boot step

## What

`packages/server/src/entry/lifecycle.ts` (around lines 310-385) builds a short-lived sessions service, runs `seedOwner`, checks for a phantom owner and, after assembly, hands each seeded owner to the embed sweep. The test harness (`tests/support/node/server.ts`, `prepareHarnessOwner`) now repeats that wiring from exported pieces so the fixture owner is boot's owner, which leaves two copies of one procedure.

## Why

Spine-Testing §9 calls a second copy of production wiring in testkit a defect; the harness must call the step the product runs, not re-implement it.

## Done when

One exported boot step under `packages/server/src/entry/boot/` performs the owner seed, the phantom-owner check and the sweep handoff; `lifecycle.ts` and `prepareHarnessOwner` both call it; the harness holds no copy; the boot and harness suites are green.

## Evidence

Filled at landing: what ran and where its output is.
