// The timeline events an Anthropic chat turn adds to the active span, read from the trace ring the composed
// root's executor reports into. A scripted SSE endpoint is the only fake.
// @subject packages/server/src/foundation/observability/tracing.ts
import { createObservabilityRings, initTracing, withRequestSpan } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node";
import { anthropicSse, anthropicTextReply, openAiServer } from "@orb/testkit/node/helpers";
import { createRuntimeRoot, wireConnection } from "../../../inference/roles/runtime.fixtures.ts";

const MODEL = "claude-opus-5";
const FINGERPRINT = "fp_fixture_70d1a4";
const rings = createObservabilityRings();

type SpanEvents = NonNullable<ReturnType<typeof rings.traces.get>>["spans"][number]["events"];

/** One Anthropic turn run inside a request span; the events that span recorded. */
async function turnSpanEvents(requestId: string): Promise<SpanEvents> {
  initTracing();
  await using root = await createRuntimeRoot({ providerFetch: () => Promise.resolve(anthropicSse(anthropicTextReply(MODEL, "ok"))) });
  const connection = await wireConnection(root, { task: "chat", providerId: "anthropic", model: MODEL, baseUrl: null, key: "sk-ant-not-a-real-key" });
  const runTurn = (): Promise<unknown> =>
    root.app.runtime.executor.runChatTurn({
      signal: new AbortController().signal,
      api: "anthropic-messages",
      connection,
      params: { effort: "high" },
      systemPrompt: { static: "You are a helpful assistant.", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "Hello." }] }],
    });
  await withRequestSpan({ traces: rings.traces, requestId }, "turn.request", {}, runTurn);
  return rings.traces.get(requestId)?.spans.flatMap((entry) => entry.events) ?? [];
}

/** One openai-compatible turn whose wire reports a model-mix fingerprint; the events its span recorded. */
async function fingerprintSpanEvents(requestId: string): Promise<SpanEvents> {
  initTracing();
  using server = openAiServer([], () => ({ fingerprint: FINGERPRINT }));
  await using root = await createRuntimeRoot({ providerFetch: server.execute });
  const connection = await wireConnection(root, { task: "chat", providerId: "custom-openai", model: "span-model" });
  const runTurn = (): Promise<unknown> =>
    root.app.runtime.executor.runChatTurn({
      signal: new AbortController().signal,
      api: "chat-completions",
      connection,
      params: {},
      systemPrompt: { static: "You are a helpful assistant.", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "Hello." }] }],
    });
  await withRequestSpan({ traces: rings.traces, requestId }, "turn.request", {}, runTurn);
  return rings.traces.get(requestId)?.spans.flatMap((entry) => entry.events) ?? [];
}

test("a turn adds its first delta, finish and cache events to the active span, the finish carrying the normalized and the raw stop word", async ({ ids }) => {
  const events = await turnSpanEvents(`turn-span:${ids.uuid()}`);
  const names = events.map((event) => event.name);
  expect(names).toEqual(expect.arrayContaining(["provider.first_delta", "provider.finish", "provider.cache"]));
  expect(events.find((event) => event.name === "provider.finish")?.attributes).toMatchObject({ finishReason: "stop", stopReason: "end_turn" });
});

test("the finish event names the fingerprint the wire reported, so a trace tells a changed backend from a stable one", async ({ ids }) => {
  // A request id of its own: the ring seals ONE trace per id, so a repeat of the case above would read that trace.
  const events = await fingerprintSpanEvents(`fingerprint-span:${ids.uuid()}`);
  const finish = events.find((event) => event.name === "provider.finish");
  // Positive control: the turn's finish reached the span at all; only the fingerprint attribute is new.
  expect(finish?.attributes).toMatchObject({ finishReason: "stop" });
  expect(finish?.attributes).toMatchObject({ systemFingerprint: FINGERPRINT });
});
