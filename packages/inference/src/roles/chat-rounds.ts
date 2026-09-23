// The two non-turn calls a caller makes on a CHAT connection, each behind one neutral input so the caller never
// branches on the connection's backend: a one-shot structured-output call (`runStructuredChat`) and a forced
// tool round (`toForcedToolRoundRequest`, gated by `carriesForcedToolRound`). Which executor method or request
// arm serves each backend is decided here; what to ask for and when to ask stays with the caller.

import type { ChatApi } from "@orb/contracts/inference";
import type { ProviderExecutor } from "../contract/backend.ts";
import type { ChatRequest, ForcedToolRoundInput, StructuredChatInput, ToolChoice } from "../contract/chat.ts";
import { ProviderError } from "../contract/errors.ts";
import type { Resolved } from "../contract/resolved.ts";

/** A forced round's choice: the model answers with calls, never prose. The backend still downgrades it to `auto`
 *  for a model that rejects forced tool use (`servableToolChoice`). */
const FORCED_TOOL_CHOICE: ToolChoice = { mode: "required" };

/** The request arm a forced round rides per chat api, `null` where there is none — a mapped Record, so a new
 *  `CHAT_APIS` member is a missing key here and fails `tsc`. The Agent SDK mounts tools as an MCP server it
 *  drives itself, which cannot be forced to call one. */
const FORCED_TOOL_ROUND: Record<ChatApi, "chat-completions" | "anthropic-messages" | null> = {
  "agent-sdk": null,
  "chat-completions": "chat-completions",
  "anthropic-messages": "anthropic-messages",
};

/** Can this connection's backend carry a forced tool round? A caller asks before building one, and takes its
 *  own fallback when the answer is no. */
export function carriesForcedToolRound(connection: Resolved<"chat">): boolean {
  return connection.api !== null && FORCED_TOOL_ROUND[connection.api] !== null;
}

/** Project a forced tool round onto its connection's request arm. A connection that cannot carry one is refused:
 *  `carriesForcedToolRound` is the caller's gate, so here it is an invariant, never a branch a caller handles. */
export function toForcedToolRoundRequest(input: ForcedToolRoundInput): ChatRequest {
  const api = input.connection.api === null ? null : FORCED_TOOL_ROUND[input.connection.api];
  if (api === null) {
    throw new ProviderError({ kind: "invalid", retryable: false, message: `connection ${input.connection.connectionId} cannot carry a forced tool round` });
  }
  return {
    api,
    chatId: input.chatId,
    connection: input.connection,
    params: {},
    systemPrompt: { static: input.systemPrompt, dynamic: "" },
    history: input.history,
    tools: input.tools,
    toolChoice: FORCED_TOOL_CHOICE,
    ...(input.signal !== undefined ? { signal: input.signal } : {}),
  };
}

type StructuredChatRunner = (executor: Pick<ProviderExecutor, "structured" | "runChatTurn">, input: StructuredChatInput) => Promise<string>;

/** The Agent SDK serves a structured call as a tool-less chat turn with an output format: the `structured`
 *  task's batch path does not serve that backend. */
const viaChatTurn: StructuredChatRunner = async (executor, input) => {
  const result = await executor.runChatTurn({
    api: "agent-sdk",
    chatId: input.chatId,
    connection: input.connection,
    params: {},
    systemPrompt: { static: input.systemPrompt, dynamic: "" },
    prompt: input.userPrompt,
    responseFormat: input.responseFormat,
    signal: input.signal,
  });
  return result.reply;
};

/** Every history wire serves it as the `structured` task on the SAME resolved row. That task's request is
 *  chatless by contract, so the chat id does not ride this arm. */
const viaStructuredTask: StructuredChatRunner = async (executor, input) => {
  const result = await executor.structured({
    connection: { ...input.connection, task: "structured" },
    inputs: [{ systemPrompt: input.systemPrompt, userPrompt: input.userPrompt }],
    responseFormat: input.responseFormat,
    signal: input.signal,
  });
  return result.items.at(0)?.text ?? "";
};

/** One runner per chat api — a mapped Record, so a new `CHAT_APIS` member fails `tsc` here. */
const STRUCTURED_CHAT: Record<ChatApi, StructuredChatRunner> = {
  "agent-sdk": viaChatTurn,
  "chat-completions": viaStructuredTask,
  "anthropic-messages": viaStructuredTask,
};

/** Run a structured-output call and return the model's JSON text (`""` when a batch answered with no item). */
export function runStructuredChat(executor: Pick<ProviderExecutor, "structured" | "runChatTurn">, input: StructuredChatInput): Promise<string> {
  const api = input.connection.api;
  return (api === null ? viaStructuredTask : STRUCTURED_CHAT[api])(executor, input);
}
