---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/chat parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `server/domain/chat`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `spliceInChatInjections.opts.excludePromptTail` | `server/src/domain/chat/assembly/injections.ts:132` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `generateDigests.args.embedSpace` | `server/src/domain/chat/memory/generate/digests.ts:268` | unsupplied-prop | delete (read) | every call resolves the space through `resolveMemoryEmbedSpace`: delete the option and the `??` branch |
| `generateSegments.args.embedSpace` | `server/src/domain/chat/memory/generate/segments.ts:181` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `createMemoryRecallRecorder.deps.limit` | `server/src/domain/chat/memory/recall/recorder.ts:26` | unsupplied-prop | delete | delete the prop and its default path (1 call); 1 test call supply it |
| `appendVariantStatements.params.selectActive` | `server/src/domain/chat/persistence/canon-write.ts:393` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `loadParticipants.includePast` | `server/src/domain/chat/persistence/participants-read.ts:136` | unsupplied | delete | delete the parameter and its default path (32 calls) |
| `loadAncestorChain.maxDepth` | `server/src/domain/chat/persistence/queries.ts:610` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `permits.action` | `server/src/domain/chat/substrate/auth/decide.ts:38` | same-literal | delete (read) | inline `"host"` and drop the parameter; every call checks the host action |
| `withToolReplay.wire.prefixRows` | `server/src/domain/chat/substrate/wire-history.ts:605` | unsupplied-prop | delete | delete the prop and its default path (1 call) |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

9 rows: applied 7, kept 1, handed off 1, owner questions 0.

Applied: `spliceInChatInjections.opts.excludePromptTail` (its only reader, `isPromptTailInjection`, went with it; the sole caller is `assembly/shape.ts:653`); `generateDigests.args.embedSpace` and `generateSegments.args.embedSpace` (callers `memory/generate/turn.ts` and `substrate/backfill.ts:158,179` pass `embedOwnerId` only); `appendVariantStatements.params.selectActive` (`engine/engine.ts:523`, `verbs/edit.ts:365`); `loadParticipants.includePast` (32 calls, none with a third argument); `loadAncestorChain.maxDepth` (the 64 cap is now the named `MAX_ANCESTOR_DEPTH`); `permits.action` (all three calls ask "host").

Kept: `withToolReplay.wire.prefixRows`. `WireRow.prefixRows` is a live field: `withToolReplay` itself sets it (`substrate/wire-history.ts:625`) and it is read at `wire-history.ts:740,781,789,935` and `engine/pipeline.ts:804`. Only the input wire omits it, which is the type's optionality, not a dead parameter.

Handed off (only a test file supplies it): `createMemoryRecallRecorder.deps.limit`, supplied by `tests/server/domain/chat/memory/recall/recorder.test.ts:20`; production passes `{ now }` only (`entry/compose/services.ts:1052`). The test is not rewritten.

Survey: codegraph_explore on the nine symbols; ast-grep over packages, tests, tooling, scripts (5929 .ts, 1524 .tsx): spliceInChatInjections 1 call, appendVariantStatements 2, loadAncestorChain 1, loadParticipants 32 (tsx 0 for each); literal `rg` for excludePromptTail, selectActive, includePast, maxDepth, embedSpace, prefixRows: no spread or `as const` writer.
Ran: `pnpm typecheck packages/server/tsconfig.json tsconfig.tests-iso.json tsconfig.node.json` exit 0; `pnpm test` joined-speaker-label, member-visibility, backfill-estimate, imported-opening-row, prompt-cache-prefix, memory-backfill-room: 6 files, 27 passed.
