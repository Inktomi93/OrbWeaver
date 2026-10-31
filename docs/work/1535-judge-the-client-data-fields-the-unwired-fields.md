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

Seven rows: 3 applied, 4 kept with a named reader, 0 owner questions.

Applied:

- `PostEventSourceInit.withCredentials`: deleted from `packages/client/src/data/bus/post-event-source.ts`. No caller supplies it (ast-grep pair scan, ts 5881 files and tsx 1514 files, plus a literal `rg`).
- `SkippedTreeFile.path` and `TreeImportPlan.bytes`: deleted with their writes in `packages/client/src/data/import-tree-plan.ts`. The test readers in `tests/client/data/import-tree-plan.int.test.ts` and `tests/e2e/sillytavern-folder-import.spec.ts` now assert the skipped count and the sent batches, since a skipped entry keeps only its reason.

Kept:

- `AddressBar.location.pathname` and `.hash` (`packages/client/src/data/join-token.ts:18`): `addressBar().location` is handed whole to `withoutUrlSearchParam`, which reads `location.pathname` and `location.hash` at `packages/client/src/lib/url-search.ts:2,16`. The type is the structural twin of that parameter.
- `Register.queryMeta` and `Register.mutationMeta` (`packages/client/src/data/query-client.ts:24,25`): TanStack reads them through `Register` module augmentation (`@tanstack/query-core` `hydration-Bf0oMcwO.d.ts:2442,3639`, `queryMeta: infer TQueryMeta`). The scanner cannot see a type-level read in `node_modules`.

Ran: `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` (exit 0); `pnpm test tests/client/data/import-tree-plan.int.test.ts` (exit 0, 11 tests). The e2e spec is covered by the tests-dom typecheck only; the orchestrator owns e2e.

Reclass list: the four kept rows above (scan blind spots: whole object handed to a function typed on a wider twin type; module augmentation read by a dependency).
