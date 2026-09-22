// `toChatRequest` — the ONE projection from a backend-neutral chat turn (`ChatTurnInput`) onto the `ChatRequest`
// arm the connection's api reads. The caller hands over a history array and its tools as definitions plus an
// execute callback; how those reach a backend — Agent SDK seed frames, a prompt and an MCP server, or a
// `tools[]` array on a history wire — is decided here and in the backend's own projection, never by the caller
// (`docs/design/inference-tool-delivery.md`). `ChatRequest` and every backend are unchanged: this sits in front
// of them.

import type { ChatApi } from "@orb/contracts/inference";
import { toAgentSdkChatRequest } from "../backends/agent-sdk/turn-input.ts";
import type { ChatRequest, ChatToolDefinition, ChatTurnInput, ChatTurnTools, ToolChoice, WireTool } from "../contract/chat.ts";
import { deltaSubscriptionOf } from "../contract/chat.ts";
import { ProviderError } from "../contract/errors.ts";

/** A turn that offers tools lets the MODEL decide (`auto`). It is the only choice a chat turn makes: a forced
 *  choice would kill the prose a turn exists to produce, and a caller that genuinely needs one (a structured
 *  extraction round) builds its own array-wire request. */
const OFFERED_TOOL_CHOICE: ToolChoice = { mode: "auto" };

/** A definition as an array wire declares it — the `WireTool` it extends, without the zod shape only the MCP
 *  projection reads. */
function wireToolOf(definition: ChatToolDefinition): WireTool {
  const { inputShape: _inputShape, ...wire } = definition;
  return wire;
}

/** The declarations an array wire sends: the executable tools first, then the terminal ones — one `tools[]`,
 *  told apart downstream by NAME only (the caller's partition). `null` ⇒ no tool rides, so the request carries
 *  neither `tools` nor `toolChoice`. */
function arrayWireTools(tools: ChatTurnTools | undefined): readonly WireTool[] | null {
  if (tools === undefined || (tools.offer === undefined && tools.terminal === undefined)) {
    return null;
  }
  return [...(tools.offer?.definitions.map(wireToolOf) ?? []), ...(tools.terminal ?? [])];
}

/** The HISTORY-ARRAY wires (chat-completions / anthropic-messages): the transcript travels as real rows, the
 *  tools as declarations the caller's own loop answers (`execute` is never called — the calls come back on
 *  `ChatResult.toolCalls` with `finishReason: "tool"`), and the array-only knobs ride as-is. */
function toArrayWireChatRequest(input: ChatTurnInput, api: "chat-completions" | "anthropic-messages"): ChatRequest {
  const tools = arrayWireTools(input.tools);
  return {
    api,
    connection: input.connection,
    params: input.params,
    systemPrompt: { static: input.systemPrompt.static, dynamic: input.systemPrompt.dynamic },
    history: input.history,
    // The cache breakpoint DEPTH (role switches from the end — `backends/kit/cache-control.ts` owns the axis).
    cacheBreakpointDepth: input.cacheBreakpointDepth,
    ...(tools !== null ? { tools, toolChoice: OFFERED_TOOL_CHOICE } : {}),
    ...(input.responseFormat !== undefined ? { responseFormat: input.responseFormat } : {}),
    // The inline-reasoning tags (the F-table "Adopt" row) — only the openai-compat transport reads them, and
    // only when the row declares no native reasoning delta field.
    ...(input.reasoningTags !== undefined ? { reasoningTags: input.reasoningTags } : {}),
    ...(input.onEvent !== undefined ? { onEvent: input.onEvent } : {}),
    ...deltaSubscriptionOf(input),
    signal: input.signal,
  };
}

/** One projection per chat api — a mapped Record, so a new `CHAT_APIS` member is a missing key here and fails
 *  `tsc` (§5.5). */
const PROJECTIONS: Record<ChatApi, (input: ChatTurnInput) => ChatRequest> = {
  "agent-sdk": toAgentSdkChatRequest,
  "chat-completions": (input) => toArrayWireChatRequest(input, "chat-completions"),
  "anthropic-messages": (input) => toArrayWireChatRequest(input, "anthropic-messages"),
};

/** Project a neutral chat turn onto its connection's request arm. A chat-task connection with no chat api (an
 *  embedding-kind row bound to `chat`) is refused: the resolver's `requirementMet` refuses it upstream, so here it
 *  is an invariant, never a branch a caller handles. */
export function toChatRequest(input: ChatTurnInput): ChatRequest {
  const api = input.connection.api;
  if (api === null) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `connection ${input.connection.connectionId} carries no chat api` });
  }
  return PROJECTIONS[api](input);
}
