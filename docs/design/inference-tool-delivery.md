---
kind: design
status: active
updated: 2026-09-22
---

# Inference-owned tool and history delivery

`@orb/inference` decides HOW a chat turn's tools and history reach each backend. The server decides WHICH
tools may act and WHAT happens after a call. Before this change the server's chat pipeline and its compose
bridge both branched on `connection.api === "agent-sdk"`: the pipeline to choose between an MCP server and a
`tools[]` array, the bridge to split history into Agent SDK seed frames and a prompt string. Both are
backend representation rules, so they move behind one inference-owned input shape.

## The neutral input

`ChatTurnInput` (`packages/inference/src/contract/chat.ts`) is the backend-neutral chat turn. It carries
what every backend could need, and nothing that names a backend:

- `connection`, `params`, `systemPrompt`, `chatId`, `onDelta`, `signal` — as on `ChatRequest`.
- `history: readonly ChatHistoryMessage[]` — the shaped transcript, always an array.
- `tools?: ChatTurnTools` — the tools offered on this turn, in two classes:
  - `offer?: ChatToolOffer` — tools the caller executes. `definitions` are `ChatToolDefinition`s (a
    `WireTool` plus `inputShape`, the zod raw shape the declaration was projected from); `execute(call)`
    runs ONE model-emitted call and returns `{ text, isError }`; `turnLimit` is the round ceiling a
    backend that owns the loop enforces.
  - `terminal?: readonly WireTool[]` — tools declared on the completion and never executed; their calls
    come back on `ChatResult.toolCalls`.
- `responseFormat`, `cacheBreakpointDepth`, `reasoningTags` — passthrough knobs a backend honours or drops.

`toChatRequest(input): ChatRequest` (`packages/inference/src/roles/chat-request.ts`) is the one projection
from the neutral turn onto the request the connection's api reads. `ChatRequest` and every backend stay
unchanged, so the backends see the same request they saw before.

- **Array wires** (`chat-completions`, `anthropic-messages`): `history` rides verbatim;
  `tools = [...offer.definitions (without inputShape), ...terminal]` with `toolChoice: auto` when any tool
  rides; `cacheBreakpointDepth` and `reasoningTags` ride. `execute` is never called: the backend returns
  the calls with `finishReason: "tool"` and the caller's loop runs them.
- **Agent SDK** (`backends/agent-sdk/turn-input.ts`): trailing system rows lift onto the dynamic system
  half; the rest splits into seed frames plus a prompt (the trailing user run, or the continuation stub);
  tool-call/result pairs ride as structural blocks only when adjacent and parseable, and degrade to
  announced text otherwise; `offer` mounts as an in-process MCP server whose handlers synthesize
  `mcp_<name>_<n>` call ids and call `execute`; `terminal` rides `terminalTools`.

A connection with no chat api is refused inside the projection with the same `ProviderError` the bridge
raised.

## What moves

| From (server) | To (inference) |
| - | - |
| `entry/compose/chat.ts` `splitAgentHistory`, `extractTrailingSystemRows`, `agentRowText`, the seed-frame and pairing helpers | `backends/agent-sdk/turn-input.ts` |
| `entry/compose/chat.ts` `agentSdkChatRequest`, `arrayWireChatRequest` (the per-api branch) | `roles/chat-request.ts` `toChatRequest` |
| `domain/chat/engine/pipeline.ts` `attachTools` / `attachTerminalTools` wire branch | the neutral `tools` field; the branch is `toChatRequest`'s |
| `domain/tool-use/verbs/project-mcp.ts` (MCP spec construction, call-id synthesis) | `backends/agent-sdk/turn-input.ts` `mountToolOffer` |

## What stays in server

- `executeToolCalls`, the registry, validation and permission checks (`domain/tool-use`). The tool-use
  projection becomes `toToolDefinitions(set)`, which replaces `toWireTools` and `toAgentToolServer`.
- `runRecurseLoop`: terminal-call partition, recursion limit, unexecuted-call records, economics
  aggregation, reasoning replay.
- The pipeline's gates: capability (`tools` declared), terminal eligibility (`coEmitsProseWithTools`),
  name-collision refusal, prefill suppression.
- The `execute` callback itself: the pipeline binds it to `executeToolCalls` for one call, keeps the
  record for persistence, and returns the record's text and error flag.
- The compose bridge's own concerns: the admin cache-depth floor, the stream pump, warning/refusal
  chunks, economics mapping.

## Rejected alternative

Make `ChatRequest` itself neutral and have each backend adapt its own input. It removes one type, but it
rewrites every backend's request contract, every backend test, and the rpg vehicles that build
`ChatRequest` arms directly, for no change in behaviour. A projection in front of the unchanged contract
gives the server one neutral seam while the backend contracts, their tests and the wire capture stay
exactly as they are.

## Coupled sites

- `packages/inference/src/contract/chat.ts`, `contract/index.ts`, `src/index.ts` — the new types and
  `toChatRequest` export.
- `packages/server/src/domain/chat/contract/results.ts` — `TurnRequest` drops `tools`, `toolChoice`,
  `agentToolServer`, `agentToolTurnLimit`, `agentTerminalTools` for one `tools?: ChatTurnTools`.
- `packages/server/src/domain/chat/contract/context.ts` — `ChatToolOps` becomes `resolveTools`,
  `toToolDefinitions`, `executeToolCalls`.
- `packages/server/src/domain/tool-use/**` — `toToolDefinitions` replaces `toWireTools` and
  `toAgentToolServer`; `project-mcp.ts` and the `CreateAgentToolServer` type are deleted.
- `packages/server/src/entry/compose/chat.ts` and `compose/index.ts` — the bridge calls `toChatRequest`;
  the split helpers leave the compose barrel.
- `docs/architecture/core/Tier-3b-Providers.md` — the seed split is inference's, not the entry bridge's.

## Test plan

- Equivalence: a matrix probe run on the tree before and after the change drives the real pipeline and
  the real compose bridge (agent-sdk and chat-completions, each with no tools, registry tools, terminal
  tools, and both; plus bridge-only histories with a paired exchange, an orphan, system rows and a nudge
  tail), serializes every `ChatRequest` handed to the runner, invokes each mounted MCP tool, and diffs the
  two dumps. The diff must be empty.
- The split and lift pins move with their code to `tests/inference/backends/agent-sdk/turn-input.test.ts`
  with their assertions unchanged.
- `tests/inference/roles/chat-request.test.ts` pins both projections: the array `tools`/`toolChoice`
  shape and order, the agent-sdk MCP mount (call-id synthesis, outcome mapping, `execute` routing), the
  terminal channel on both arms, and the no-api refusal.
- `tests/server/domain/tool-use/verbs/to-tool-definitions.test.ts` replaces the `toWireTools` and
  `project-mcp` pins; record parity (an `execute` call equals the direct `executeToolCalls` record) moves
  to the pipeline test.
- Pipeline, engine and turn tests assert the neutral `tools` field instead of the per-wire fields.
