---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/data shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `client/data`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `CardImportResult` / `CardImportResult` | `client/src/data/import-characters.ts:15` | reexport-chain | delete | export it from its home, not through `contracts/src/import/index.ts` |
| `ChatImportResult` / `ChatImportResult` | `client/src/data/import-chats.ts:16` | reexport-chain | delete | export it from its home, not through `contracts/src/import/index.ts` |
| `ChatBusDeps` / `ChatBusDeps` | `client/src/data/index.ts:27` | reexport-chain | delete | export it from its home, not through `client/src/data/bus/index.ts` |
| `markTurnStopping` / `markTurnStopping` | `client/src/data/index.ts:29` | reexport-chain | delete | export it from its home, not through `client/src/data/bus/index.ts` |
| `recoverTurnAfterStopFailure` / `recoverTurnAfterStopFailure` | `client/src/data/index.ts:30` | reexport-chain | delete | export it from its home, not through `client/src/data/bus/index.ts` |
| `useBusRoom` / `useBusRoom` | `client/src/data/index.ts:31` | reexport-chain | delete | export it from its home, not through `client/src/data/bus/index.ts` |
| `useChatBus` / `useChatBus` | `client/src/data/index.ts:32` | reexport-chain | delete | export it from its home, not through `client/src/data/bus/index.ts` |
| `useChatBusDeps` / `useChatBusDeps` | `client/src/data/index.ts:33` | reexport-chain | delete | export it from its home, not through `client/src/data/bus/index.ts` |
| `useOrbSocket` / `useOrbSocket` | `client/src/data/index.ts:34` | reexport-chain | delete | export it from its home, not through `client/src/data/bus/index.ts` |
| `useRpgBus` / `useRpgBus` | `client/src/data/index.ts:35` | reexport-chain | delete | export it from its home, not through `client/src/data/bus/index.ts` |
| `useUserBus` / `useUserBus` | `client/src/data/index.ts:36` | reexport-chain | delete | export it from its home, not through `client/src/data/bus/index.ts` |
| `CardImportResult` / `CardImportResult` | `client/src/data/index.ts:48` | reexport-chain | delete | export it from its home, not through `client/src/data/import-characters.ts`, `contracts/src/import/index.ts` |
| `ChatImportResult` / `ChatImportResult` | `client/src/data/index.ts:50` | reexport-chain | delete | export it from its home, not through `client/src/data/import-chats.ts`, `contracts/src/import/index.ts` |
| `InvalidateFilter` / `InvalidateFilter` | `client/src/data/index.ts:56` | reexport-chain | delete | export it from its home, not through `client/src/data/invalidation.ts` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
