---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/dev fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/dev`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `GameSeedResult.chatId` | `client/src/dev/agent-seed/retry-attempt.ts:6` | never-read | delete | delete the field and its writes (`client/src/dev/agent-seed/index.ts:356`) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

One row: reclassified from delete to derived (0 deleted, 1 derived, 0 owner questions).

- `GameSeedResult.chatId` (`packages/client/src/dev/agent-seed/retry-attempt.ts`): `__orb.seed.game` resolves with `{ chatId }`, and that result is the published contract of the dev agent bridge (`OrbSeedHandle.game`, `packages/client/src/lib/agent-bridge-handles.ts:44`; agent hint at `packages/client/src/lib/agent-bridge.ts:155`). Snap and browser agents read it outside the tree (`tooling/src/unwired/deliberate.ts:17`, the `AGENT_BRIDGE` reason). Deleting the field would change that output. `GameSeedResult` is now `Awaited<ReturnType<OrbSeedHandle["game"]>>`, so the handle owns the shape and the restated twin is gone.
- Ran: `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` (exit 0). `GameSeedResult` is used only in `retry-attempt.ts` and `packages/client/src/dev/agent-seed/index.ts` (rg over `packages tests tooling scripts`).
- Reclass list: `GameSeedResult.chatId` delete -> derive from the owning type (a bridge result read by agents outside the tree).
