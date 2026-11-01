---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/connection parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/domain/connection`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `vectorSpaceOf.connectionId` | `server/src/domain/connection/substrate/embed-space.ts:72` | unsupplied | delete | delete the parameter and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

1 row: applied 1, kept 0, handed off 0, owner questions 0.

Applied: `vectorSpaceOf.connectionId`. The only caller, `vectorSpacesOf` in the same file (`embed-space.ts:30`), omits it; `vectorResolutionOf` keeps its own `connectionId` through-option, which the preview verbs supply.

Survey: codegraph_explore on vectorSpaceOf, SpaceResolveCtx; ast-grep `vectorSpaceOf($$$)` on -l ts and -l tsx over packages, tests, tooling, scripts (5929 .ts, 1524 .tsx): 1 call; literal `rg` for vectorSpaceOf: same hit.
Ran: `pnpm typecheck packages/server/tsconfig.json tsconfig.node.json` exit 0; `pnpm test tests/server/domain/connection/verbs/embed-space-rebuild.int.test.ts` 4 passed.
