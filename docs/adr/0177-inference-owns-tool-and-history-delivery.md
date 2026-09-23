---
kind: adr
status: active
updated: 2026-09-23
---

# Inference owns tool and history delivery; the server owns which tools act

## Context

The chat pipeline and the compose bridge both branched on `connection.api === "agent-sdk"`: the pipeline to choose between an MCP server and a `tools[]` array, the bridge to split history into Agent SDK seed frames and a prompt. Both are backend representation rules living in the server.

## Decision

`@orb/inference` decides how a turn's tools and history reach each backend. `ChatTurnInput` (`packages/inference/src/contract/chat.ts`) is the backend-neutral turn: history, an optional tool `offer` the caller executes, `terminal` tools that are declared and never executed, and passthrough knobs. `toChatRequest` (`packages/inference/src/roles/chat-request.ts`) is the one projection onto the unchanged `ChatRequest`. Array wires carry the tools inline and return calls for the caller's loop; the Agent SDK path (`backends/agent-sdk/turn-input.ts`) lifts trailing system rows, splits history into seed frames and a prompt, and mounts the offer as an in-process MCP server. The server decides which tools may act and what happens after a call: the tool-use registry, validation and permission checks, the recurse loop, the capability and terminal-eligibility gates, and the `execute` callback. `ChatToolOps.prepareExecution` resolves the host Principal once, before the request is built, so an authority failure fails the turn before the model is called on every wire.

## Consequences

No server code names a backend when it offers tools. An SDK-driven tool handler never sees an authority exception, which the SDK would otherwise hand to the model as tool-result text with no record.

## Alternatives rejected

- Make `ChatRequest` itself neutral and let each backend adapt: it rewrites every backend contract, every backend test and the rpg vehicles that build `ChatRequest` values directly, for no change in behaviour.
