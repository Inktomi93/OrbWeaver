---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/stats fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/stats`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ByModelOpts.limit` | `server/src/domain/stats/contract/params.ts:23` | never-read | delete | delete the field and its writes (`server/src/transport/trpc/routers/stats.ts:50`) |
| `CanonMessage.tokenProvenance` | `server/src/domain/stats/contract/rebuild-from-canon.ts:133` | never-read | delete | delete the field and its writes (`server/src/domain/stats/substrate/rebuild-rollups.ts:690`) |
| `CanonMessage.gs` | `server/src/domain/stats/contract/rebuild-from-canon.ts:134` | unreferenced | delete | delete the field |
| `CanonMessage.gf` | `server/src/domain/stats/contract/rebuild-from-canon.ts:135` | unreferenced | delete | delete the field |
| `CanonMessage.reasoning` | `server/src/domain/stats/contract/rebuild-from-canon.ts:138` | unreferenced | delete | delete the field |
| `CanonMessage.reasoningDur` | `server/src/domain/stats/contract/rebuild-from-canon.ts:139` | unreferenced | delete | delete the field |
| `SwipeRow.tokenProvenance` | `server/src/domain/stats/contract/rebuild-from-canon.ts:157` | never-read | delete | delete the field and its writes (`server/src/domain/stats/substrate/rebuild-rollups.ts:697`) |
| `SwipeRow.gs` | `server/src/domain/stats/contract/rebuild-from-canon.ts:158` | unreferenced | delete | delete the field |
| `SwipeRow.gf` | `server/src/domain/stats/contract/rebuild-from-canon.ts:159` | unreferenced | delete | delete the field |
| `SwipeRow.reasoning` | `server/src/domain/stats/contract/rebuild-from-canon.ts:162` | unreferenced | delete | delete the field |
| `SwipeRow.reasoningDur` | `server/src/domain/stats/contract/rebuild-from-canon.ts:163` | unreferenced | delete | delete the field |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
