// backends/anthropic-messages/chat — the DIRECT Anthropic wire's turn. The load-bearing pin is the two-leg
// THINKING + TOOL loop (audit A1): leg 1 streams a `thinking` block with its signature and a `tool_use`; the
// engine replays that reasoning on leg 2, and the assertion is on the WIRE BODY the converter produced — a
// real `{"type":"thinking", thinking, signature}` block ahead of the tool call. Dropping the signature is how
// a thinking+tool loop loses its verified reasoning (and, on the arms that enforce it, 400s).
//
// Also pinned here: the A2 prefill belt (a trailing assistant row on a model whose capability refuses prefill
// is a typed refusal, never a silent send), the A3 SDK-warning surfacing, and B2's applied/dropped receipt.

import type { UserIntent } from "@orb/contracts/preset";
import { runAnthropicChatTurn } from "../../../../packages/inference/src/backends/anthropic-messages/chat.ts";
import type { AnthropicChatRequest } from "../../../../packages/inference/src/contract/chat.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import type { InferenceLog } from "../../../../packages/inference/src/deps.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { fakeApiKeySecret, fakeResolved } from "../../_support.ts";
import type { RecordedRequest, SseEvent } from "../_hosted-support.ts";
import { anthropicRedactedStream, anthropicTextStream, anthropicThinkingToolStream, generationCapability, scriptedSseFetch } from "../_hosted-support.ts";

const NOW = 1_700_000_000_000;
const THINKING = "The user wants Paris weather; call the tool.";
const SIGNATURE = "ErcDCpkBCBIYAipASIGNATURE";

interface LogLine {
  readonly level: string;
  readonly fields: Record<string, unknown>;
}

function recordingLog(lines: LogLine[]): InferenceLog {
  const push =
    (level: string): InferenceLog["info"] =>
    (fields): void => {
      lines.push({ level, fields: { ...fields } });
    };
  return { debug: push("debug"), info: push("info"), warn: push("warn"), error: push("error") };
}

function turnRequest(overrides: Partial<AnthropicChatRequest> = {}): AnthropicChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "anthropic",
    model: "claude-opus-4-5-20251101",
    capability: generationCapability(),
    baseUrl: "https://api.anthropic.com",
    secret: fakeApiKeySecret("sk-ant-probe-not-a-real-key"),
  });
  const params: UserIntent = { effort: "high" };
  return {
    api: "anthropic-messages",
    connection,
    params,
    systemPrompt: { static: "You are a helpful assistant.", dynamic: "" },
    history: [{ role: "user", content: [{ type: "text", text: "What is the weather in Paris?" }] }],
    tools: [{ name: "get_weather", description: "Weather for a city.", parameters: { type: "object", properties: { city: { type: "string" } } } }],
    ...overrides,
  } as AnthropicChatRequest;
}

function deps(fetchImpl: typeof fetch, lines: LogLine[] = []): Parameters<typeof runAnthropicChatTurn>[1] {
  return { now: () => NOW, log: recordingLog(lines), transport: { fetch: fetchImpl } };
}

function assistantRowOf(recorded: RecordedRequest): Record<string, unknown> {
  const messages = recorded.body["messages"];
  const row = Array.isArray(messages) ? messages.find((m: unknown) => (m as { role?: string }).role === "assistant") : undefined;
  return (row ?? {}) as Record<string, unknown>;
}

test("a thinking + tool loop replays the reasoning block WITH its signature on the second leg", async () => {
  const recorded: RecordedRequest[] = [];
  const streams: SseEvent[][] = [anthropicThinkingToolStream({ thinking: THINKING, signature: SIGNATURE }), anthropicTextStream("18C and clear.")];
  const fetchImpl = scriptedSseFetch(streams, recorded);

  const leg1 = await runAnthropicChatTurn(turnRequest(), deps(fetchImpl));
  expect(leg1.reasoning).toBe(THINKING);
  expect(leg1.toolCalls?.[0]?.name).toBe("get_weather");
  // The captured reasoning parts are what the engine persists and replays (the record lane stores them).
  expect(leg1.reasoningParts).toHaveLength(1);
  expect(leg1.reasoningParts?.[0]).toMatchObject({ type: "reasoning", text: THINKING, meta: { anthropic: { signature: SIGNATURE } } });

  const leg2 = turnRequest({
    history: [
      { role: "user", content: [{ type: "text", text: "What is the weather in Paris?" }] },
      {
        role: "assistant",
        content: [...(leg1.reasoningParts ?? []), { type: "tool-call", toolCallId: "toolu_1", name: "get_weather", arguments: '{"city":"Paris"}' }],
      },
      { role: "tool", content: [{ type: "tool-result", toolCallId: "toolu_1", content: "18C, clear." }] },
    ],
  });
  await runAnthropicChatTurn(leg2, deps(fetchImpl));

  const second = recorded[1];
  expect(second).toBeDefined();
  const blocks = assistantRowOf(second as RecordedRequest)["content"];
  expect(Array.isArray(blocks)).toBe(true);
  expect(blocks).toMatchObject([
    { type: "thinking", thinking: THINKING, signature: SIGNATURE },
    { type: "tool_use", name: "get_weather" },
  ]);
});

test("a redacted thinking block rides back as opaque data, and IS what marks the turn redacted", async () => {
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch([anthropicRedactedStream("REDACTED-PAYLOAD")], recorded);
  const turn = await runAnthropicChatTurn(turnRequest(), deps(fetchImpl));
  expect(turn.reasoningRedacted).toBe(true);
  expect(turn.reasoningParts?.[0]).toMatchObject({ type: "reasoning", text: "", meta: { anthropic: { redactedData: "REDACTED-PAYLOAD" } } });
});

test("a turn with no reasoning at all is not reported as redacted", async () => {
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch([anthropicTextStream("plain")], recorded);
  const turn = await runAnthropicChatTurn(turnRequest(), deps(fetchImpl));
  expect(turn.reasoningRedacted).toBe(false);
  expect(turn.reasoningParts ?? []).toHaveLength(0);
});

test("A2 belt: a delivered trailing assistant row on a model that refuses prefill is a typed refusal", async () => {
  const recorded: RecordedRequest[] = [];
  const fetchImpl = scriptedSseFetch([anthropicTextStream("never sent")], recorded);
  const req = turnRequest({
    history: [
      { role: "user", content: [{ type: "text", text: "Continue:" }] },
      { role: "assistant", content: [{ type: "text", text: "Once upon a" }] },
    ],
    tools: undefined,
  });
  const err = await runAnthropicChatTurn(req, deps(fetchImpl)).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ProviderError);
  expect(err).toMatchObject({ kind: "invalid", retryable: false });
  expect(recorded).toHaveLength(0);
});

test("A3/B2: an SDK-dropped sampler knob becomes a warning event and leaves the applied receipt", async () => {
  const recorded: RecordedRequest[] = [];
  const lines: LogLine[] = [];
  const fetchImpl = scriptedSseFetch([anthropicTextStream("ok")], recorded);
  const req = turnRequest({ params: { effort: "high", temperature: 0.5, frequencyPenalty: 0.5 } as UserIntent, tools: undefined });
  const turn = await runAnthropicChatTurn(req, deps(fetchImpl, lines));
  const codes = turn.events.flatMap((e) => (e.kind === "warning" ? [e.code] : []));
  expect(codes).toContain("sdk_unsupported_setting");
  const sampling = lines.find((line) => line.fields["event"] === "provider.sampling");
  expect(sampling).toBeDefined();
  const applied = sampling?.fields["applied"] as Record<string, unknown>;
  const dropped = sampling?.fields["dropped"] as { knob: string }[];
  expect(applied["frequencyPenalty"]).toBeUndefined();
  expect(dropped.map((d) => d.knob)).toContain("frequencyPenalty");
});
