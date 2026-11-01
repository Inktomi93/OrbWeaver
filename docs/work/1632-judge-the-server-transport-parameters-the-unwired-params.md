---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/transport parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/transport`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `startOidcGcScheduler.deps.intervalMs` | `server/src/transport/jobs/oidc-gc-scheduler.ts:59` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `createFrameQueue.opts.capacity` | `server/src/transport/trpc/stream/frame-queue.ts:106` | unsupplied-prop | delete | delete the prop and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

2 rows: applied 1, left and flagged 1, kept 0, handed off 0, owner questions 0.

Applied: `createFrameQueue.opts.capacity`. The one caller, `packages/server/src/transport/trpc/stream/socket.ts:107`, passes `cursorFor` and `onShed` only, and no test builds a queue with a capacity. The 512-frame bound stays as the named `FRAME_QUEUE_CAPACITY`.

Left and flagged (session cleanup scheduler, lane rule; 1698): `startOidcGcScheduler.deps.intervalMs` (`packages/server/src/transport/jobs/oidc-gc-scheduler.ts:59`). Not touched.

Survey: codegraph_explore on createFrameQueue; ast-grep `createFrameQueue($$$)` on -l ts and -l tsx over packages, tests, tooling, scripts (5929 .ts, 1524 .tsx): 1 call (tsx 0); literal `rg` for capacity in tests/server/transport: no writer.
Ran: `pnpm typecheck packages/server/tsconfig.json tsconfig.tests-iso.json tsconfig.node.json` exit 0; `pnpm test` recipient-isolation and live-bus-isolation: 2 files, 5 passed.
