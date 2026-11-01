---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/assets parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/domain/assets`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `AssetsService.collectGarbage.options.graceMs` | `server/src/domain/assets/contract/service.ts:103` | unsupplied-prop | delete | delete the prop and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

1 row: applied 1, kept 0, handed off 0, owner questions 0.

Applied: `AssetsService.collectGarbage.options.graceMs`. The only caller, `packages/server/src/domain/assets/workload-contributions.ts:96`, passes `{ dryRun, signal }`. The one-hour window stays as the named constant `GRACE_MS` (`verbs/collect-garbage.ts`), so the safety budget keeps its name.

Survey: codegraph_explore on AssetsService collectGarbage graceMs; ast-grep `collectGarbage($$$)` on -l ts and -l tsx over packages, tests, tooling, scripts (5929 .ts, 1524 .tsx): the workload caller only; literal `rg` for graceMs and GcOptions: no other writer (the `tooling/src/snap/ops/session-registry.ts` graceMs is an unrelated function).
Ran: `pnpm typecheck packages/server/tsconfig.json tsconfig.tests-iso.json tsconfig.node.json` exit 0; `pnpm test tests/server/domain/assets/verbs/collect-garbage.int.test.ts` 5 passed.
