---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/automation parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/domain/automation`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `AutomationService.testRule.params.sampleEvent` | `server/src/domain/automation/contract/service.ts:186` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

1 row: applied 1, kept 0, handed off 0, owner questions 0.

Applied: `AutomationService.testRule.params.sampleEvent`. The tRPC `testRule` input never carried it (`transport/trpc/routers/automation.ts`), and a literal `rg` for `sampleEvent` across packages and tests finds no writer, so the row's "1 test call" note did not hold. The verb always synthesizes the fact from the rule's trigger.

Survey: codegraph_explore on AutomationService testRule sampleEvent; ast-grep `testRule($$$)` on -l ts and -l tsx over packages, tests, tooling, scripts (5929 .ts, 1524 .tsx): the factory wrapper `tests/support/node/factories/automation.ts:70` forwards params only.
Ran: `pnpm typecheck packages/server/tsconfig.json tsconfig.tests-iso.json tsconfig.node.json` exit 0; `pnpm test` automation-response-loss and run-now: passed.
