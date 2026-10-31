---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/data fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/data`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PostEventSourceInit.withCredentials` | `client/src/data/bus/post-event-source.ts:40` | unreferenced | delete | delete the field |
| `SkippedTreeFile.path` | `client/src/data/import-tree-plan.ts:39` | never-read | delete | delete the field and its writes (`client/src/data/import-tree-plan.ts:155`) and the 3 test references |
| `TreeImportPlan.bytes` | `client/src/data/import-tree-plan.ts:49` | never-read | delete | delete the field and its writes (`client/src/data/import-tree-plan.ts:162`) |
| `AddressBar.location.pathname` | `client/src/data/join-token.ts:18` | unreferenced | delete | delete the field |
| `AddressBar.location.hash` | `client/src/data/join-token.ts:18` | unreferenced | delete | delete the field |
| `Register.queryMeta` | `client/src/data/query-client.ts:24` | unreferenced | delete | delete the field |
| `Register.mutationMeta` | `client/src/data/query-client.ts:25` | unreferenced | delete | delete the field |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
