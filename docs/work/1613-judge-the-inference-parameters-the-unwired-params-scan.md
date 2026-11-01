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

16 rows: applied 6, kept 3, owner ruled 7 (wired 2, refused 5), handed off 0.

Applied: `createAgentSdkBackend.deps.debug` (also the internal `AgentSdkDeps.debug`, `observabilityOptions` and its two spreads, and the then-unused `log` parameter of `verifyAuth`); `decodeEmbeddingVector.expectedDimensions`; `detectServer.args.signal` (`answer` still takes the deadline signal); `createMirror.args.ttlMs`; `InferenceRuntime.modelKind.options` (deleting it left `cachedKind` with no caller, so it went too; the `coldAs`/`cachedFacts` options now live on `modelTasks`, which supplies them from `connection/substrate/kind.ts`); `runStructuredChat.input.onObservedResult` (the rpg rounds inject the observer through the wrapped executor, `rpg/tools/rounds/round-connection.ts` `withGenerationObservation`).

Kept: `resolveTaskWithBaseline.args.actor`, `.signal`, `.cachedFacts`. The shared `ResolveArgs` is read by `resolveTaskFold`, which `resolveTask` reaches with all three supplied (`packages/inference/src/index.ts` `resolve`). Narrowing only the baseline wrapper needs a split argument type and keeps the fold reads; that is a design call, not a delete.

Owner ruling on the seven request-shaping rows: they stay and get wired up, and a field with no truthful supplier is reported with its evidence. This replaces the Decision column for these rows.

Wired: `createAgentToolServer.opts.name` and `.opts.version`. Both are now required. `mountToolOffer` (`packages/inference/src/backends/agent-sdk/turn-input.ts`) passes `MCP_NAMESPACE` and `MCP_SERVER_VERSION` (`packages/inference/src/backends/agent-sdk/translate.ts`), and `DEFAULT_TOOL_SERVER_NAME` is gone. The values are the old fixed ones: name `orbweaver`, version `1.0.0` (the SDK default in `createSdkMcpServer`). The prefix a model sees comes from the `mcpServers` key, which was already `MCP_NAMESPACE`; `serverInfo` never reaches a prompt. Proof: `tests/server/domain/connection/verbs/sdk-wire.int.test.ts` has the physical child read `sdkMcpServers` off `initialize` and run `initialize`, `tools/list` and `tools/call` through the SDK-owned server. It passed on the old source and on the new source with the same bytes, so a byte-identical change has no red run by construction.

Refused, no truthful supplier: `ChatToolOffer.execute.call.thoughtSignature`, `.openrouter`, `.atChars`, `.partOrdinal`. The fields are live on `ToolCallInput`; only the `execute` door lacks them. `mountToolOffer` is its one caller and runs only on the agent-sdk wire, where `tool()` hands a handler `(args, extra: unknown)` and no provider part (`sdk.d.ts` `SdkMcpToolDefinition`). The runtime owns replay on that wire through its session. `executeOfferedCall` in `packages/server/src/domain/chat/engine/pipeline.ts` takes the position from `textOffset()`, the streamed length at call time, and passes no `calls` to `recordToolBoundary`, so an `atChars` here would have no reader; `partOrdinal` is read only by `captureReplyParts` on the array-wire loop. Narrowing the `execute` parameter would clear the scan row, but the ruling says the fields stay, so it needs an owner call.

The array-wire replay path has no drop. `drainStream` (`packages/inference/src/backends/v4/stream.ts`) captures all four fields, `receivedToolExchangeMessages` replays them on the next leg, `toolDepthSignatures` stores them, `recordedToolPart` restores them, and `toolCallPart` (`packages/inference/src/backends/v4/prompt.ts`) sends them. Google native was covered by `tests/server/domain/chat/persistence/inline-reply-image-rows.suite.int.test.ts`; `tests/server/domain/chat/engine/openrouter-tool-replay.int.test.ts` now covers OpenRouter on both the answering leg and a later turn. It passed on unmodified source, and two planted breaks failed it: `toolCallPart` without `openrouter` and `toolDepthSignatures` without `openrouter`. A registry call that loses its signature because a terminal call came first is safe on Gemini 3: `@ai-sdk/google` sends `skip_thought_signature_validator` for an unsigned call.

Refused, no truthful supplier: `structuredFitFor.format.description`. The fit cannot vary with it. `packages/inference/src/structured/plan.ts` only copies `description` into the planned format and the tool; no violation reads it. The one caller is the refinery draft preview, whose draft has `description: ""` and no client input for one (`packages/server/src/domain/refinery/verbs/preview-schema-plan.ts`). `ResponseFormat.description` itself stays live: the plugin quiet path sends one (`packages/server/src/domain/plugin/verbs/quiet-llm.ts`). A stored refinery schema's description already reaches the model as the prompt instruction (`packages/server/src/domain/refinery/substrate/stage-resolution.ts`); adding it to the format would say it twice and would replace `STRUCTURED_TOOL_DESCRIPTION` on the tool vehicle.

Survey: codegraph_explore on the item symbols; literal `rg` for debug, ttlMs, expectedDimensions, onObservedResult, modelKind, cachedKind, coldAs across packages, tests, tooling (ts and tsx): no writer through a spread or `as const`; `tests/server/domain/connection/verbs/sdk-wire.int.test.ts` onObservedResult hits belong to `toChatRequest`, not `runStructuredChat`.
Ran: `pnpm typecheck packages/inference/tsconfig.json packages/server/tsconfig.json tsconfig.tests-iso.json tsconfig.node.json` exit 0 (router config included); `pnpm test` detect, agent-sdk catalog, private-diagnostics, sdk-wire, runtime-ownership: 5 files, 29 tests passed.

Ast-grep scan added after review (packages, tests, tooling, scripts; 5929 .ts and 1524 .tsx files each): createAgentSdkBackend 1 call, decodeEmbeddingVector 1, detectServer 1, runStructuredChat 2, createMirror 4 (ts); tsx 0 for each. Literal rg earlier found no other writer of debug, ttlMs, expectedDimensions, onObservedResult for these.
