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

Applied: `RefreshCatalogParams.signal` (the router and the workload stop passing it; the runtime refresh never took one), `EmbedSpace.model`, `ConnectionService.registry`. The six test files that reached the registry through the service now read `root.app.runtime.providers.registry`, and the two provider seed helpers type the origin from `ProviderRegistry` in `@orb/inference`.

Applied under the ruling that an unread tRPC output field carries no product intent: `ConnectionCapabilityView.cacheContext` and `.warnings` are gone from the type, the strict schema and the returned object (`packages/server/src/domain/connection/verbs/resolve.ts`). `cacheContext` is still read inside the verb to resolve the cache plan, so only the returned key went. No client or test reads either key (ast-grep `$X.cacheContext` on 5930 ts and 1523 tsx tracked files finds only server reads). The corpus was republished in the same commit with `pnpm exec node scripts/corpus-fixture.ts publish <dir>`.

Ran `pnpm typecheck packages/server/tsconfig.json` and `pnpm typecheck tsconfig.node.json` (both exit 0). Tests: `tests/server/domain/connection/persistence/provider-rows.int.test.ts`, `tests/support/node/factories/plugin.int.test.ts`, `tests/support/node/corpus-plugin.int.test.ts`, `tests/server/domain/plugin/activation/provider-contributions.suite.int.test.ts`; result in the commit report.
