---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: rpg
---

# A model cannot hang the server with a large plot act number

## What

The plot patch argument `act` in `packages/contracts/src/rpg/tools.ts` and the stored plot shape in `packages/contracts/src/rpg/snapshot.ts` are whole numbers with a minimum and no maximum. `applyPlotPatch` in `packages/server/src/domain/rpg/tools/apply.ts` appends empty acts in a loop until the list reaches that number, with no bound between the model's value and the loop.

## Why

One model reply with a very large act number fills memory on the server's one thread. In a shared room that stops the host for every member.

## Done when

The wire argument and the stored shape share one named maximum, an act above it is dropped and recorded like any other refused tool value, and a case sends an act far above the maximum through the real state round and the flush returns.

## Evidence

Filled at landing: what ran and where its output is.
