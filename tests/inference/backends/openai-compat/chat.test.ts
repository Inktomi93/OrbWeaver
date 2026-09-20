// backends/openai-compat/chat — the openai-compat wire's turn on both dialects. The load-bearing pin is the
// two-leg tool loop through the OPENROUTER transport (audit A1/H4): leg 1 streams `reasoning_details` with a
// signature, and leg 2's wire body must carry those details back on the assistant row — the replay contract
// the OR provider implements for Anthropic, Gemini (thought signatures) and OpenAI (encrypted reasoning)
// alike, and which it silently strips when an entry arrives unsigned.
//
// Also pinned: H1(b) verbosity rides `extraBody` on the OR route when the capability advertises it (measured
// 2026-09-19: OR forwards it upstream), and E2 — a provider id with a `-` keys `providerOptions` by its camel
// form, so the SDK stops pushing a deprecation warning on every single call.

import type { UserIntent } from "@orb/contracts/preset";
import { runOpenAiCompatChatTurn } from "../../../../packages/inference/src/backends/openai-compat/chat.ts";
import type { ChatResult, OpenAiCompatChatRequest } from "../../../../packages/inference/src/contract/chat.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeApiKeySecret, fakeResolved } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { generationCapability, openAiTextStream, openRouterReasoningToolStream, scriptedSseFetch } from "../_hosted-support.ts";

const NOW = 1_700_000_000_000;
const REASONING = "Paris weather needs the tool.";
const SIGNATURE = "sig-anthropic-claude-v1";

const APP = { name: "orbweaver-test", url: "http://localhost:0" };

function silentLog(): Parameters<typeof runOpenAiCompatChatTurn>[1]["log"] {
  const noop = (): void => undefined;
  return { debug: noop, info: noop, warn: noop, error: noop };
}

function turnDeps(fetchImpl: typeof fetch): Parameters<typeof runOpenAiCompatChatTurn>[1] {
  return { now: () => NOW, log: silentLog(), transport: { fetch: fetchImpl, app: APP } };
}

function orRequest(overrides: Partial<OpenAiCompatChatRequest> = {}): OpenAiCompatChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "anthropic/claude-opus-4-5",
    capability: generationCapability(),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
  });
  return {
    api: "chat-completions",
    connection,
    params: { effort: "high" } satisfies UserIntent,
    systemPrompt: { static: "You are a helpful assistant.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "What is the weather in Paris?" }] }],
    tools: [{ name: "get_weather", description: "Weather for a city.", parameters: { type: "object", properties: { city: { type: "string" } } } }],
    ...overrides,
  } as OpenAiCompatChatRequest;
}

function assistantRowOf(recorded: RecordedRequest): Record<string, unknown> {
  const messages = recorded.body["messages"];
  const row = Array.isArray(messages) ? messages.find((m: unknown) => (m as { role?: string }).role === "assistant") : undefined;
  return (row ?? {}) as Record<string, unknown>;
}

function warningCodes(turn: ChatResult): string[] {
  return turn.events.flatMap((event) => (event.kind === "warning" ? [event.code] : []));
}

test("OR tool loop: leg 1's reasoning_details ride back on leg 2's assistant row", async () => {
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch([openRouterReasoningToolStream({ text: REASONING, signature: SIGNATURE }), openAiTextStream("18C and clear.")], recorded);

  const leg1 = await runOpenAiCompatChatTurn(orRequest(), turnDeps(fetchImpl));
  expect(leg1.toolCalls?.[0]?.name).toBe("get_weather");
  expect(leg1.reasoningParts).toHaveLength(1);
  const details = leg1.reasoningParts?.[0]?.meta?.openrouter?.reasoningDetails;
  expect(Array.isArray(details)).toBe(true);
  expect(JSON.stringify(details)).toContain(SIGNATURE);

  const leg2 = orRequest({
    history: [
      { role: "user", content: [{ type: "text", text: "What is the weather in Paris?" }] },
      {
        role: "assistant",
        content: [...(leg1.reasoningParts ?? []), { type: "tool-call", toolCallId: "call_1", name: "get_weather", arguments: '{"city":"Paris"}' }],
      },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "call_1", content: "18C, clear." }] },
    ],
  });
  await runOpenAiCompatChatTurn(leg2, turnDeps(fetchImpl));

  const second = recorded[1];
  expect(second).toBeDefined();
  const assistant = assistantRowOf(second as RecordedRequest);
  expect(JSON.stringify(assistant["reasoning_details"])).toContain(SIGNATURE);
});

test("H1(b): verbosity rides extraBody on the OR route when the capability advertises it", async () => {
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch([openAiTextStream("ok")], recorded);
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "openai/gpt-5.4",
    capability: generationCapability({ verbosity: ["low", "medium", "high"] }),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
  });
  const req = orRequest({ connection, params: { effort: "high", verbosity: "low" } as UserIntent, tools: undefined });
  const turn = await runOpenAiCompatChatTurn(req, turnDeps(fetchImpl));
  expect(warningCodes(turn)).not.toContain("verbosity_dropped");
  expect(recorded[0]?.body["verbosity"]).toBe("low");
});

test("E2: a hyphenated provider id keys providerOptions by its camel form (no per-call deprecation)", async () => {
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch([openAiTextStream("ok")], recorded);
  const connection = fakeResolved({
    task: "chat",
    providerId: "custom-openai",
    model: "some-model",
    capability: generationCapability({ sampling: { temperature: { min: 0, max: 2 }, repetitionPenalty: { min: 0, max: 2 } } }),
    baseUrl: "https://box.local/v1",
    secret: fakeApiKeySecret("sk-box-not-a-real-key"),
  });
  const req = orRequest({ connection, params: { effort: "high", repetitionPenalty: 1.1 } as UserIntent, tools: undefined });
  const turn = await runOpenAiCompatChatTurn(req, turnDeps(fetchImpl));
  const messages = turn.events.flatMap((event) => (event.kind === "warning" ? [event.message] : []));
  expect(messages.filter((message) => message.includes("providerOptions key"))).toHaveLength(0);
  // The unmodelled knob still reaches the body — the camel key is what the SDK spreads.
  expect(recorded[0]?.body["repetition_penalty"]).toBe(1.1);
});
