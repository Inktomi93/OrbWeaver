// The crew agent turn is BACKEND-GENERIC (D67 amendment). A crew keeper turn is a tool-less, one-shot
// STRUCTURED turn with no SDK runtime need (no session resume, no tool/MCP hands), so it runs on whatever
// the resolved agent connection's api dictates — the room-turn precedent, capability-gated. agent-sdk keeps
// `runAgentTurn` (structured output rides the agent role, not the chat-role agent-sdk arm); the chat
// backends run a single (system, user) turn via `runChatTurn`: chat-completions/responses carry the
// `responseFormat`, anthropic-messages is tool-less by charter (its arm has NO responseFormat) so a
// structured crew turn there yields free prose the keeper's `runStructuredTurn` rejects — fail-closed by
// validation, never mis-parsed lore. No honest-refusal is needed (unlike solo buddy) because crew needs no
// SDK runtime feature; the structured-output capability is the only gate, and it fails closed.

import type { ResolvedConnection } from "@orb/contracts/connection";
import type { UserIntent } from "@orb/contracts/preset";
import type { CrewGuideTurnRequest } from "#domain/crew";
import type { CrewAgentRequest } from "#domain/workloads";
import type { ChatRequest } from "#infra/providers";

/** Build the ChatRequest for a crew turn on a NON-agent-sdk connection (chat-completions / responses /
 *  anthropic-messages). agent-sdk crew turns dispatch to `runAgentTurn` at the call site (structured output
 *  is not on the chat-role agent-sdk arm), so an agent-sdk connection here is a caller bug — it throws. */
export function buildCrewChatRequest(conn: ResolvedConnection, req: CrewAgentRequest): ChatRequest {
  const params: UserIntent = req.maxOutputTokens === undefined ? {} : { maxOutputTokens: req.maxOutputTokens };
  const base = {
    credential: conn.credential,
    model: conn.model,
    capability: conn.capability,
    params,
    systemPrompt: { static: req.systemPrompt, dynamic: "" },
    ...(req.signal !== undefined ? { signal: req.signal } : {}),
  };
  const history = [{ role: "user" as const, content: [{ type: "text" as const, text: req.prompt }] }];
  if (conn.api === "anthropic-messages") {
    return { ...base, api: "anthropic-messages", history };
  }
  if (conn.api === "chat-completions" || conn.api === "responses") {
    return { ...base, api: conn.api, history, responseFormat: req.responseFormat };
  }
  throw new Error("buildCrewChatRequest: an agent-sdk connection uses runAgentTurn, not the chat role");
}

/** Build the ChatRequest for a FREE-TEXT crew GUIDE turn on a NON-agent-sdk connection (chat-crew-design/06
 *  §3 — a guide refresh has NO responseFormat; it is a plain OOC side generation). agent-sdk dispatches to
 *  `runAgentTurn` at the call site, so an agent-sdk connection here is a caller bug — it throws. */
export function buildCrewGuideChatRequest(conn: ResolvedConnection, req: CrewGuideTurnRequest): ChatRequest {
  const base = {
    credential: conn.credential,
    model: conn.model,
    capability: conn.capability,
    params: {} satisfies UserIntent,
    systemPrompt: { static: req.systemPrompt, dynamic: "" },
  };
  const history = [{ role: "user" as const, content: [{ type: "text" as const, text: req.prompt }] }];
  if (conn.api === "anthropic-messages") {
    return { ...base, api: "anthropic-messages", history };
  }
  if (conn.api === "chat-completions" || conn.api === "responses") {
    return { ...base, api: conn.api, history };
  }
  throw new Error("buildCrewGuideChatRequest: an agent-sdk connection uses runAgentTurn, not the chat role");
}
