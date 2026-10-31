---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the inference parameters the unwired params scan reports

## What

`pnpm unwired params` reports each of the parameters below in `inference`; `reports/unwired/params.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Parameter | At | Kind | Class | Decision |
| - | - | - | - | - |
| `createAgentSdkBackend.deps.debug` | `inference/src/backends/agent-sdk/index.ts:51` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `createAgentToolServer.opts.name` | `inference/src/backends/agent-sdk/index.ts:118` | unsupplied-prop | delete (read) | no caller names or versions the tool server: delete the option and keep the default |
| `createAgentToolServer.opts.version` | `inference/src/backends/agent-sdk/index.ts:118` | unsupplied-prop | delete (read) | no caller names or versions the tool server: delete the option and keep the default |
| `decodeEmbeddingVector.expectedDimensions` | `inference/src/backends/wire/embedding-decode.ts:40` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `detectServer.args.signal` | `inference/src/catalog/detect.ts:61` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `createMirror.args.ttlMs` | `inference/src/catalog/mirror.ts:22` | unsupplied-prop | delete | delete the prop and its default path (4 calls) |
| `InferenceRuntime.modelKind.options` | `inference/src/contract/api.ts:53` | unsupplied | delete | delete the parameter and its default path (1 call) |
| `ChatToolOffer.execute.call.thoughtSignature` | `inference/src/contract/chat.ts:96` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `ChatToolOffer.execute.call.openrouter` | `inference/src/contract/chat.ts:96` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `ChatToolOffer.execute.call.atChars` | `inference/src/contract/chat.ts:96` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `ChatToolOffer.execute.call.partOrdinal` | `inference/src/contract/chat.ts:96` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `resolveTaskWithBaseline.args.actor` | `inference/src/resolve/resolve-task.ts:597` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `resolveTaskWithBaseline.args.signal` | `inference/src/resolve/resolve-task.ts:597` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `resolveTaskWithBaseline.args.cachedFacts` | `inference/src/resolve/resolve-task.ts:597` | unsupplied-prop | delete | delete the prop and its default path (1 call) |
| `runStructuredChat.input.onObservedResult` | `inference/src/roles/chat-rounds.ts:72` | unsupplied-prop | delete | delete the prop and its default path (2 calls) |
| `structuredFitFor.format.description` | `inference/src/structured/plan.ts:305` | unsupplied-prop | delete (read) | no caller describes a structured format, so `STRUCTURED_TOOL_DESCRIPTION` always applies: delete the field and the branch |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired params` no longer reports the row.

## Evidence

16 rows: applied 6, kept 3, owner questions 7, handed off 0.

Applied: `createAgentSdkBackend.deps.debug` (also the internal `AgentSdkDeps.debug`, `observabilityOptions` and its two spreads, and the then-unused `log` parameter of `verifyAuth`); `decodeEmbeddingVector.expectedDimensions`; `detectServer.args.signal` (`answer` still takes the deadline signal); `createMirror.args.ttlMs`; `InferenceRuntime.modelKind.options` (deleting it left `cachedKind` with no caller, so it went too; the `coldAs`/`cachedFacts` options now live on `modelTasks`, which supplies them from `connection/substrate/kind.ts`); `runStructuredChat.input.onObservedResult` (the rpg rounds inject the observer through the wrapped executor, `rpg/tools/rounds/round-connection.ts` `withGenerationObservation`).

Kept: `resolveTaskWithBaseline.args.actor`, `.signal`, `.cachedFacts`. The shared `ResolveArgs` is read by `resolveTaskFold`, which `resolveTask` reaches with all three supplied (`packages/inference/src/index.ts` `resolve`). Narrowing only the baseline wrapper needs a split argument type and keeps the fold reads; that is a design call, not a delete.

Owner questions (shape a provider request, so not a delete under the lane rule): `createAgentToolServer.opts.name`, `.opts.version` (the MCP server name prefixes every tool name the model sees); `ChatToolOffer.execute.call.thoughtSignature`, `.openrouter`, `.atChars`, `.partOrdinal` (tool-call replay context); `structuredFitFor.format.description` (the structured tool description).

Survey: codegraph_explore on the item symbols; literal `rg` for debug, ttlMs, expectedDimensions, onObservedResult, modelKind, cachedKind, coldAs across packages, tests, tooling (ts and tsx): no writer through a spread or `as const`; `tests/server/domain/connection/verbs/sdk-wire.int.test.ts` onObservedResult hits belong to `toChatRequest`, not `runStructuredChat`.
Ran: `pnpm typecheck packages/inference/tsconfig.json packages/server/tsconfig.json tsconfig.tests-iso.json tsconfig.node.json` exit 0 (router config included); `pnpm test` detect, agent-sdk catalog, private-diagnostics, sdk-wire, runtime-ownership: 5 files, 29 tests passed.
