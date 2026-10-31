---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the contracts parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `contracts`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `accepts.side` | `contracts/src/inference/capability/reads.ts:33` | same-literal | delete | inline `"input"` and drop the parameter (2 calls) |
| `checkWireSchema.strictTools` | `contracts/src/inference/wire-limits.ts:278` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `hintOf.members` | `contracts/src/refinery/schema-forge.ts:309` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `clampActorCardName.maxLength` | `contracts/src/rpg/actor.ts:217` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `constrainArrayItemRef.arrayField` | `contracts/src/rpg/extraction.ts:148` | same-literal | delete | inline `"inventory"` and drop the parameter (2 calls) |
| `constrainArrayItemRef.refProp` | `contracts/src/rpg/extraction.ts:148` | same-literal | delete | inline `"targetRef"` and drop the parameter (2 calls) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
