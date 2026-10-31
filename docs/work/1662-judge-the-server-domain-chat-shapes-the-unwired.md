---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/chat shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/chat`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `ResolveViewerVisibility` / `ResolveViewerVisibility` | `server/src/domain/chat/contract/context.ts:90` | reexport-chain | delete | export it from its home, not through `contracts/src/chat/index.ts` |
| `StoreSegmentParams` / `StoreSegmentParams` | `server/src/domain/chat/contract/context.ts:90` | reexport-chain | delete | export it from its home, not through `contracts/src/chat/index.ts` |
| `ChatRpgOps` / `RpgChatOps` | `server/src/domain/chat/contract/context.ts:340` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/domain/rpg/contract/chat-turn.ts:37`; a shape that matches by coincidence stays |
| `MemoryEmbedSpace` / `MemoryEmbedSpace` | `server/src/domain/chat/contract/memory.ts:8` | reexport-chain | delete | export it from its home, not through `contracts/src/embeddings/index.ts` |
| `ResolvedMemoryConfig` / `MemoryCfg` | `server/src/domain/chat/contract/memory.ts:51` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/domain/chat/substrate/backfill-estimate.ts:20`; a shape that matches by coincidence stays |
| `ChatMetadata` / `ChatMetadata` | `server/src/domain/chat/contract/metadata.ts:24` | reexport-chain | delete | export it from its home, not through `contracts/src/chat/index.ts` |
| `RequestTurnParams` / `RequestTurnParams` | `server/src/domain/chat/contract/params.ts:30` | reexport-chain | delete | export it from its home, not through `contracts/src/chat/index.ts` |
| `GuidedSteer` / `GuidedSteer` | `server/src/domain/chat/contract/params.ts:38` | reexport-chain | delete | export it from its home, not through `contracts/src/chat/index.ts` |
| `HostTierRegexAllow` / `HostTierRegexAllow` | `server/src/domain/chat/contract/regex.ts:84` | reexport-chain | delete | export it from its home, not through `contracts/src/chat/index.ts` |
| `RequestTurnOp` / `RequestTurnOp` | `server/src/domain/chat/contract/results.ts:55` | reexport-chain | delete | export it from its home, not through `contracts/src/chat/index.ts` |
| `CreateInviteResult` / `CreateInviteResult` | `server/src/domain/chat/contract/results.ts:62` | reexport-chain | delete | export it from its home, not through `contracts/src/chat/index.ts` |
| `TurnIntent` / `TurnIntent` | `server/src/domain/chat/contract/results.ts:62` | reexport-chain | delete | export it from its home, not through `contracts/src/chat/index.ts` |
| `ImpersonateStreamDelta` / `ImpersonateStreamDelta` | `server/src/domain/chat/contract/results.ts:490` | reexport-chain | delete | export it from its home, not through `contracts/src/chat/index.ts` |
| `ChatStatsBatchWiring` / `StatsBatchWiring` | `server/src/domain/chat/contract/stats-batch.ts:7` | restated | wire (read) | chat restates the stats wiring it consumes: derive chat's port from the stats owner (the plan's step 1) |
| `ResolveViewerVisibility` / `ResolveViewerVisibility` | `server/src/domain/chat/index.ts:17` | reexport-chain | delete | export it from its home, not through `server/src/domain/chat/contract/context.ts`, `contracts/src/chat/index.ts` |
| `RequestTurnOp` / `RequestTurnOp` | `server/src/domain/chat/index.ts:28` | reexport-chain | delete | export it from its home, not through `server/src/domain/chat/contract/results.ts`, `contracts/src/chat/index.ts` |
| `ChatContext` / `ChatAssemblyContext` | `server/src/domain/chat/index.ts:36` | renamed-reexport | delete (read) | the door renames `…AssemblyContext`: give the type one name at its declaration |
| `requireAuthorOrHost` / `requireWiredAuthorOrHost` | `server/src/domain/chat/index.ts:39` | renamed-reexport | delete | use the home name `requireWiredAuthorOrHost` |
| `requireHost` / `requireWiredHost` | `server/src/domain/chat/index.ts:39` | renamed-reexport | delete | use the home name `requireWiredHost` |
| `requireParticipant` / `requireWiredParticipant` | `server/src/domain/chat/index.ts:39` | renamed-reexport | delete | use the home name `requireWiredParticipant` |
| `isBelowHistoryFloor` / `isBelowHistoryFloor` | `server/src/domain/chat/index.ts:77` | reexport-chain | delete | export it from its home, not through `server/src/domain/chat/substrate/auth/index.ts` |
| `Tier0Counts` / `PlanCommit` | `server/src/domain/chat/memory/generate/digests.ts:131` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/domain/chat/substrate/backfill.ts:282`; a shape that matches by coincidence stays |
| `CollectedSegments` / `SegmentWork` | `server/src/domain/chat/memory/generate/segments.ts:47` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/domain/chat/substrate/backfill.ts:100`; a shape that matches by coincidence stays |
| `MemoryEmbedSpace` / `MemoryEmbedSpace` | `server/src/domain/chat/memory/types.ts:7` | reexport-chain | delete | export it from its home, not through `server/src/domain/chat/contract/memory.ts`, `contracts/src/embeddings/index.ts` |
| `ParticipantRowShape` / `HumanSeat` | `server/src/domain/chat/persistence/participant.ts:36` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/domain/chat/substrate/participants-humans.ts:31`; a shape that matches by coincidence stays |
| `ChatRow` / `ChatDetailRow` | `server/src/domain/chat/persistence/queries.ts:76` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/domain/chat/substrate/chat-detail.ts:18`; a shape that matches by coincidence stays |
| `NO_HISTORY_FLOOR` / `NO_HISTORY_FLOOR` | `server/src/domain/chat/substrate/auth/index.ts:4` | reexport-chain | delete | export it from its home, not through `contracts/src/chat/index.ts` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Counts: 27 rows = 24 applied, 2 kept with reason, 1 owner question. 0 handed off.

Note: `ReapResult` and `TurnOutcome` on the `contract/results.ts` re-export line are not rows; left.

Method: survey `codegraph_explore` on the chat contract and door symbols; ast-grep (ts 5949 tracked files, tsx 1525) for importers; consumers rewritten with the `move-import-names` codemod (plan from importers of each re-export module), then Biome organize.

Applied (reexport-chain, contract re-exports deleted, importers now take the contracts home): `ResolveViewerVisibility`, `StoreSegmentParams`, `RequestTurnOp`, `CreateInviteResult`, `TurnIntent`, `ImpersonateStreamDelta`, `HostTierRegexAllow`, `RequestTurnParams`, `GuidedSteer`, `ChatMetadata` (from `@orb/contracts/chat`), `MemoryEmbedSpace` in `contract/memory.ts` and `memory/types.ts` (from `@orb/contracts/embeddings`), `NO_HISTORY_FLOOR` in `substrate/auth/index.ts` (from `@orb/contracts/chat`), and the two `chat/index.ts` rows for `ResolveViewerVisibility` and `RequestTurnOp`. `isBelowHistoryFloor`: `chat/index.ts` exports it from `substrate/auth/clamp.ts`.
Applied (renamed-reexport): the door exports `ChatAssemblyContext` (an inner `ChatContext` already exists in `contract/context.ts`, so the declaration cannot take that name) and `requireWiredAuthorOrHost`, `requireWiredHost`, `requireWiredParticipant`; importers renamed. Guard.ts keeps its unwired `requireHost` family, a different function.
Applied (restated, one concept):
- `ResolvedMemoryConfig` / `MemoryCfg`: `MemoryCfg` was `ReturnType<typeof resolveCfg>`, which returns `ResolvedMemoryConfig`; `substrate/backfill-estimate.ts` uses the contract type.
- `Tier0Counts` / `PlanCommit`: one tally that feeds `logBuild`; `Tier0Counts` now lives in `contract/memory.ts` and `backfill.ts` uses it.
- `ParticipantRowShape` / `HumanSeat`: `HumanSeat` is `classifyParticipant`'s parameter type.
- `ChatRow` / `ChatDetailRow`: `ChatDetailRow` derives from `loadChatRow`'s result.
Kept:
- `CollectedSegments` / `SegmentWork`: `SegmentWork` is already `Awaited<ReturnType<typeof collectSegments>>`, so it derives from the one declaration.
- `ChatRpgOps` / `RpgChatOps`: chat's declared type of the injected rpg op and rpg's own offered op list; law section 4 "Cross-feature dependency" (a verb declares the type of an injected cross-feature op in its contract, no sideways import). Compose assignment checks both sides.
Owner question: `ChatStatsBatchWiring` / `StatsBatchWiring` (class wire). The two interfaces are identical over `@orb/contracts/stats` types and `@orb/db/wiring` handles. Deriving chat's from stats needs chat to import `#domain/stats` (a sideways import, law section 4) or the shape to move to a package both domains import; the file header of `contract/stats-batch.ts` rules the signatures chat's own. Left in place.
