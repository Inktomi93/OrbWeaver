// Unit: buildCrewChatRequest — the backend-generic crew turn's ChatRequest assembly (D67 amendment). Crew
// is a tool-less, one-shot STRUCTURED turn; the chat backends run it via runChatTurn. Pins: the per-api arm
// (chat-completions/responses carry responseFormat; anthropic-messages is tool-less so it does NOT), the
// single (system, user) shape, the maxOutputTokens→params mapping, and the agent-sdk caller-bug throw.

import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { ResponseFormat } from "@orb/contracts/role-clients";
import { castId } from "@orb/kit/ids";
import type { CrewAgentRequest } from "@orb/server/domain/workloads";
import { buildCrewChatRequest } from "../../../../packages/server/src/entry/compose/crew-turn.ts";
import { makeAnthropicCredential, makeOpenRouterCredential, makeResolvedCredential } from "../../../support/factories";
import { expect, test } from "../../../support/fixtures";

const CAPABILITY: ModelCapability = {
  reasoning: { mode: "none", enabled: false },
  sampling: {},
  output: { maxTokens: { min: 1, max: 4096 }, structured: true },
  context: { window: 32_768 },
};

const RESPONSE_FORMAT: ResponseFormat = { name: "crew_payload", schema: { type: "object" } };
const AGENT_SDK_THROW = /agent-sdk/;

/** A brand-protected credential matching the connection's source — routed through the sanctioned support
 *  factory (never a double-cast, which would survive ResolvedCredential gaining a required field). */
function credentialFor(source: string): ResolvedCredential {
  if (source === "anthropic") {
    return makeAnthropicCredential();
  }
  if (source === "max-pro-sub") {
    return makeResolvedCredential("max-pro-sub");
  }
  return makeOpenRouterCredential();
}

function conn(api: ResolvedConnection["api"], source = "openrouter"): ResolvedConnection {
  return {
    api,
    model: castId("claude-haiku-4-5"),
    credential: credentialFor(source),
    capability: CAPABILITY,
  };
}

function req(overrides: Partial<CrewAgentRequest> = {}): CrewAgentRequest {
  return {
    ownerId: castId("user_host"),
    systemPrompt: "SYS",
    prompt: "PROMPT",
    responseFormat: RESPONSE_FORMAT,
    ...overrides,
  };
}

test("chat-completions carries the responseFormat + the single (system, user) turn", () => {
  const request = buildCrewChatRequest(conn("chat-completions"), req({ maxOutputTokens: 512 }));

  expect(request.api).toBe("chat-completions");
  expect(request.systemPrompt).toEqual({ static: "SYS", dynamic: "" });
  expect(request.params.maxOutputTokens).toBe(512);
  // The structured constraint rides the wire on the chat-completions arm.
  expect(request.api === "chat-completions" && request.responseFormat).toEqual(RESPONSE_FORMAT);
  expect(request.api === "chat-completions" && request.history).toEqual([{ role: "user", content: [{ type: "text", text: "PROMPT" }] }]);
});

test("responses also carries the responseFormat", () => {
  const request = buildCrewChatRequest(conn("responses"), req());
  expect(request.api).toBe("responses");
  expect(request.api === "responses" && request.responseFormat).toEqual(RESPONSE_FORMAT);
});

test("anthropic-messages is tool-less — the arm carries NO responseFormat (structured fails closed at validation)", () => {
  const request = buildCrewChatRequest(conn("anthropic-messages", "anthropic"), req());
  expect(request.api).toBe("anthropic-messages");
  // The tool-less arm has no responseFormat field at all — a structured crew turn here yields prose the
  // keeper's runStructuredTurn rejects (fail-closed by validation, never mis-parsed lore).
  expect("responseFormat" in request).toBe(false);
});

test("no maxOutputTokens → an empty params (all-default UserIntent)", () => {
  const request = buildCrewChatRequest(conn("chat-completions"), req());
  expect(request.params).toEqual({});
});

test("an agent-sdk connection throws — the caller dispatches those to runAgentTurn", () => {
  expect(() => buildCrewChatRequest(conn("agent-sdk", "max-pro-sub"), req())).toThrow(AGENT_SDK_THROW);
});
