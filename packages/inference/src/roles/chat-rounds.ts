// The two non-turn calls a caller makes on a CHAT connection, each behind one neutral input so the caller never
// branches on the connection's backend: a one-shot structured-output call (`runStructuredChat`) and a forced
// tool round (`toForcedToolRoundRequest`, gated by `carriesForcedToolRound`). Which request arm serves each backend
// is decided here; what to ask for and when to ask stays with the caller.

import type { ChatApi } from "@orb/contracts/inference";
import type { ProviderExecutor } from "../contract/backend.ts";
import type { ChatRequest, ForcedToolRoundInput, StructuredChatInput, ToolChoice, WireTool } from "../contract/chat.ts";
import { ProviderError } from "../contract/errors.ts";
import type { Resolved } from "../contract/resolved.ts";
import { planStructuredFor } from "../structured/plan.ts";
import { structuredTargetOf } from "../structured/target.ts";
import { sideGenChatRequest, sideGenReplyOf } from "./side-gen.ts";

/** A forced round's choice: the model answers with calls, never prose. The structured plan sends it as `auto`
 *  where the model rejects forced tool use, and says so. */
const FORCED_TOOL_CHOICE: ToolChoice = { mode: "required" };

/** The request arm a forced round rides per chat api, `null` where there is none — a mapped Record, so a new
 *  `CHAT_APIS` member is a missing key here and fails `tsc`. The Agent SDK mounts tools as an MCP server it
 *  drives itself, which cannot be forced to call one. */
const FORCED_TOOL_ROUND: Record<ChatApi, Exclude<ChatApi, "agent-sdk"> | null> = {
  "agent-sdk": null,
  "chat-completions": "chat-completions",
  "anthropic-messages": "anthropic-messages",
  "google-generative-ai": "google-generative-ai",
};

/** Can this connection's backend carry a forced tool round? A caller asks before building one, and takes its
 *  own fallback when the answer is no. */
export function carriesForcedToolRound(connection: Resolved<"chat">): boolean {
  return connection.api !== null && FORCED_TOOL_ROUND[connection.api] !== null;
}

/** Does a forced round with these tools go out forced on this connection? `false` where the structured plan sends
 *  `required` as `auto` (the model may then answer without a call), or refuses the tools outright. The round's own
 *  request carries the same plan, so a caller's fallback and the wire agree. */
export function forcesToolRound(connection: Resolved<"chat">, tools: readonly WireTool[]): boolean {
  const plan = planStructuredFor(connection, { tools, toolChoice: FORCED_TOOL_CHOICE });
  return plan.ok && plan.toolChoice?.mode === FORCED_TOOL_CHOICE.mode;
}

/** Does this connection carry any structured payload at all (a native format, or one tool)? A caller asks before
 *  offering a structured-only feature, and degrades visibly when the answer is no. */
export function carriesStructured(connection: Resolved): boolean {
  return structuredTargetOf(connection).vehicles.length > 0;
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

/** Run a structured-output call as one side-generation chat turn on the connection's own api, and return the model's
 *  JSON payload (`""` where a tool vehicle went uncalled). The chat id rides for wire-capture correlation. */
export async function runStructuredChat(executor: Pick<ProviderExecutor, "runChatTurn">, input: StructuredChatInput): Promise<string> {
  const result = await executor.runChatTurn(
    sideGenChatRequest({
      connection: input.connection,
      item: { systemPrompt: input.systemPrompt, userPrompt: input.userPrompt },
      params: {},
      responseFormat: input.responseFormat,
      chatId: input.chatId,
      signal: input.signal,
    }),
  );
  return sideGenReplyOf(result, input.connection.model);
}
