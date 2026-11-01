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

Fourteen rows: applied 13, kept 1, handed off 0, owner question 0.

- `CardImportResult` x3 (`import-characters.ts`, `data/index.ts`) and `ChatImportResult` x3 (`import-chats.ts`, `data/index.ts`): the data re-exports are deleted; the three consumers (`character-import-dialog.tsx`, `portability-model.ts`, `chat-import-dialog.tsx`) import the type from `@orb/contracts/import`, its home. Scan: ast-grep ts+tsx over `packages tests`; no other importer used the `#data` path.
- `ChatBusDeps`, `markTurnStopping`, `recoverTurnAfterStopFailure`, `useBusRoom`, `useChatBus`, `useChatBusDeps`, `useOrbSocket`, `useRpgBus`, `useUserBus`: `data/index.ts` exports each from its home file under `data/bus/`. `data/bus/index.ts` had no other importer (rg over `packages tests` and configs) and is deleted.
- `InvalidateFilter`: kept. No such symbol exists (ast-grep ts+tsx 0 hits, rg 0); `data/index.ts` already exports `Invalidation` straight from `./invalidation.ts`, its home.
- `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` exit 0; `pnpm lint:eslint` on the touched files exit 0; `pnpm depcruise` exit 0.
