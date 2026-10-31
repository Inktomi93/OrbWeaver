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

Filled at landing: what ran and where its output is.
