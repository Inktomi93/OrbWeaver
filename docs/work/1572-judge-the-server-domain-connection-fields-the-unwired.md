---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/connection fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/connection`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `RefreshCatalogParams.signal` | `server/src/domain/connection/contract/params.ts:130` | never-read | delete | delete the field and its writes (`server/src/domain/connection/workload-contributions.ts:25`) |
| `ConnectionCapabilityView.cacheContext` | `server/src/domain/connection/contract/results.ts:15` | never-read | delete | delete the field and its writes (`server/src/domain/connection/verbs/resolve.ts:80`) |
| `ConnectionCapabilityView.warnings` | `server/src/domain/connection/contract/results.ts:19` | never-read | delete | delete the field and its writes (`server/src/domain/connection/verbs/resolve.ts:82`) |
| `EmbedSpace.model` | `server/src/domain/connection/contract/results.ts:46` | never-read | delete | delete the field and its writes (`server/src/domain/connection/substrate/embed-space.ts:61`) |
| `ConnectionService.registry` | `server/src/domain/connection/contract/service.ts:153` | never-read | delete | delete the field and its writes (`server/src/domain/connection/service.ts:42`) and the 12 test references |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
