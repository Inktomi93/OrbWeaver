---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/features/automation fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/features/automation`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PendingAsk.chatId` | `client/src/features/automation/lib/apply-automation-bus-event.ts:38` | never-read | delete | delete the field and its writes (`client/src/features/automation/lib/apply-automation-bus-event.ts:68`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

One row: 1 applied, 0 kept, 0 owner questions.

- `PendingAsk.chatId`: deleted with its write in `packages/client/src/features/automation/lib/apply-automation-bus-event.ts`. The only consumer, `packages/client/src/features/automation/components/suggestion-card-mount.tsx`, reads `id`, `summary`, `kind`, `detail` and `expiresAt` and takes `chatId` from its own room state (line 86). `PendingAsk` appears in 2 files (rg over `packages tests tooling`).
- Ran: `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` (exit 0, run together with items 1539 to 1544). No test covers the reducer or the card mount.
- Reclass list: none.
