// backends/v4/stream — the V4 part-stream reducer (`drainStream`). Under test: the reasoning-block fold
// across the THREE part kinds that can carry provenance (`reasoning-start` → Anthropic's `redactedData`,
// `reasoning-delta` → Anthropic's `signature`, `reasoning-end` → OpenRouter's `reasoning_details`), keyed
// by the SDK's own part `id` so a multi-block turn keeps each block's provenance with its own text
// (audit A1/H4); the "no provenance ⇒ dropped" rule the header states but nothing before this file pinned;
// the truncated-stream fail-closed (#1400's class); and the control-part folds (warnings, responseId,
// finish, error) nothing exercised directly — `index.test.ts` never reaches this file, only the two hosted
// wires' `chat.test.ts` do, and only through the reasoning-provenance arms their own turns produce.

import { drainStream } from "../../../../packages/inference/src/backends/v4/stream.ts";
import { ProviderError } from "../../../../packages/inference/src/contract/errors.ts";
import { expect, test } from "../../../support/fixtures.ts";

// The SDK's own stream-part type, DERIVED from `drainStream`'s signature — `tests/` has no `@ai-sdk/provider`
// dependency (the package owns the SDK; the batch runner's test uses the same idiom). `ProviderMetadata` and
// its inner `JSONObject` are derived the same way rather than re-spelled as `Record<string, unknown>`: the
// loose spelling forced an `as unknown as` double cast at every call site, and that cast was hiding real
// drift — a `{ type: "unsupported-setting", setting }` warning the V4 union cannot carry and usage objects
// missing every field but `total` (both repaired below, `packages/inference/src/backends/v4/stream.ts`).
type StreamArg = Parameters<typeof drainStream>[0];
type StreamPart = StreamArg extends ReadableStream<infer P> ? P : never;
type FinishPart = Extract<StreamPart, { type: "finish" }>;
type ProviderMetadata = NonNullable<Extract<StreamPart, { type: "reasoning-delta" }>["providerMetadata"]>;
type JSONObject = ProviderMetadata[string];

/** Contextual typing for an authored stream part — the array literals below are checked against the SDK's
 *  real (large, picky) discriminated union, so a part shape the wire cannot produce is a tsc red here. */
function part(p: StreamPart): StreamPart {
  return p;
}

/** The V4 nested usage shape, spelled once: every count is a REQUIRED field that may hold `undefined`, so a
 *  `{ total }` literal is not a usage object. */
function usageOf(inputTotal: number, outputTotal: number): FinishPart["usage"] {
  return {
    inputTokens: { total: inputTotal, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
    outputTokens: { total: outputTotal, text: undefined, reasoning: undefined },
  };
}

function streamOf(parts: readonly StreamPart[]): StreamArg {
  return new ReadableStream({
    start(controller): void {
      for (const p of parts) {
        controller.enqueue(p);
      }
      controller.close();
    },
  });
}

const FINISH = part({ type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: usageOf(1, 1) });

function anthropicMeta(fields: JSONObject): { readonly anthropic: JSONObject } {
  return { anthropic: fields };
}
function openrouterMeta(details: readonly JSONObject[]): { readonly openrouter: JSONObject } {
  return { openrouter: { reasoning_details: details } };
}

test("a reasoning block's text and provenance arrive on DIFFERENT parts and fold onto the SAME block by id", async () => {
  const drain = await drainStream(
    streamOf([
      part({ type: "reasoning-start", id: "r1", providerMetadata: anthropicMeta({}) }),
      part({ type: "reasoning-delta", id: "r1", delta: "thinking about it" }),
      part({ type: "reasoning-delta", id: "r1", delta: "...", providerMetadata: anthropicMeta({ signature: "sig-abc" }) }),
      part({ type: "reasoning-end", id: "r1" }),
      part({ type: "text-delta", id: "t1", delta: "the answer" }),
      FINISH,
    ]),
    { label: "test" },
  );
  expect(drain.reasoning).toBe("thinking about it...");
  expect(drain.reply).toBe("the answer");
  expect(drain.reasoningParts).toHaveLength(1);
  expect(drain.reasoningParts[0]).toEqual({ type: "reasoning", text: "thinking about it...", meta: { anthropic: { signature: "sig-abc" } } });
});

test("TWO reasoning blocks (two SDK ids) each keep their OWN text and provenance — no cross-block bleed", async () => {
  const drain = await drainStream(
    streamOf([
      part({ type: "reasoning-start", id: "r1" }),
      part({ type: "reasoning-delta", id: "r1", delta: "block one", providerMetadata: anthropicMeta({ signature: "sig-1" }) }),
      part({ type: "reasoning-start", id: "r2" }),
      part({ type: "reasoning-delta", id: "r2", delta: "block two" }),
      part({ type: "reasoning-end", id: "r2", providerMetadata: openrouterMeta([{ type: "reasoning.text", text: "block two", signature: "sig-2" }]) }),
      FINISH,
    ]),
    { label: "test" },
  );
  // Accumulated reasoning TEXT is still one string in stream order — only the PART list keeps blocks separate.
  expect(drain.reasoning).toBe("block oneblock two");
  expect(drain.reasoningParts).toHaveLength(2);
  const [first, second] = drain.reasoningParts;
  expect(first).toEqual({ type: "reasoning", text: "block one", meta: { anthropic: { signature: "sig-1" } } });
  expect(second).toEqual({
    type: "reasoning",
    text: "block two",
    meta: { openrouter: { reasoningDetails: [{ type: "reasoning.text", text: "block two", signature: "sig-2" }] } },
  });
});

test("a redacted block carries provenance with NO text at all — the block survives with an empty string", async () => {
  const drain = await drainStream(
    streamOf([
      part({ type: "reasoning-start", id: "r1", providerMetadata: anthropicMeta({ redactedData: "opaque-payload" }) }),
      part({ type: "reasoning-end", id: "r1" }),
      part({ type: "text-delta", id: "t1", delta: "done" }),
      FINISH,
    ]),
    { label: "test" },
  );
  expect(drain.reasoningParts).toEqual([{ type: "reasoning", text: "", meta: { anthropic: { redactedData: "opaque-payload" } } }]);
});

test("a reasoning block with NO provenance on any part is DROPPED — replaying bare text is what every converter refuses", async () => {
  const drain = await drainStream(
    streamOf([
      part({ type: "reasoning-start", id: "r1" }),
      part({ type: "reasoning-delta", id: "r1", delta: "unsigned thinking" }),
      part({ type: "reasoning-end", id: "r1" }),
      FINISH,
    ]),
    { label: "test" },
  );
  // The TEXT is still counted toward the turn's rendered `reasoning` string — only the REPLAYABLE part list drops it.
  expect(drain.reasoning).toBe("unsigned thinking");
  expect(drain.reasoningParts).toEqual([]);
});

test("provenance is LAST-WRITE-WINS per field: a later signature on the same id overwrites an earlier one", async () => {
  const drain = await drainStream(
    streamOf([
      part({ type: "reasoning-start", id: "r1", providerMetadata: anthropicMeta({ signature: "sig-old" }) }),
      part({ type: "reasoning-delta", id: "r1", delta: "x", providerMetadata: anthropicMeta({ signature: "sig-new" }) }),
      FINISH,
    ]),
    { label: "test" },
  );
  expect(drain.reasoningParts[0]?.meta?.anthropic?.signature).toBe("sig-new");
});

test("onReasoning fires once per NON-EMPTY delta; a zero-length delta (the signature-only part) fires nothing", async () => {
  const seen: string[] = [];
  await drainStream(
    streamOf([
      part({ type: "reasoning-delta", id: "r1", delta: "a" }),
      part({ type: "reasoning-delta", id: "r1", delta: "", providerMetadata: anthropicMeta({ signature: "sig" }) }),
      FINISH,
    ]),
    { label: "test", onReasoning: (text) => seen.push(text) },
  );
  expect(seen).toEqual(["a"]);
});

test("onText fires per text-delta and onPart fires once per stream part (control parts included)", async () => {
  const text: string[] = [];
  let partCount = 0;
  await drainStream(streamOf([part({ type: "text-delta", id: "t1", delta: "hi" }), part({ type: "text-delta", id: "t1", delta: " there" }), FINISH]), {
    label: "test",
    onText: (t) => text.push(t),
    onPart: () => {
      partCount += 1;
    },
  });
  expect(text).toEqual(["hi", " there"]);
  expect(partCount).toBe(3);
});

test("stream-start warnings accumulate and finish carries usage + providerMetadata + responseId from response-metadata", async () => {
  const drain = await drainStream(
    streamOf([
      // `{ type: "unsupported", feature }` is the V4 warning shape — the V2-era `{ type: "unsupported-setting",
      // setting }` this arm used to assert is a value the SDK union cannot carry, and only the double cast
      // let it through.
      part({ type: "stream-start", warnings: [{ type: "unsupported", feature: "temperature" }] }),
      part({ type: "response-metadata", id: "resp-123" }),
      part({ type: "text-delta", id: "t1", delta: "ok" }),
      part({
        type: "finish",
        finishReason: { unified: "stop", raw: "stop" },
        usage: usageOf(5, 2),
        providerMetadata: { anthropic: { foo: "bar" } },
      }),
    ]),
    { label: "test" },
  );
  expect(drain.warnings).toEqual([{ type: "unsupported", feature: "temperature" }]);
  expect(drain.responseId).toBe("resp-123");
  expect(drain.usage).toEqual({ inputTokens: { total: 5 }, outputTokens: { total: 2 } });
  expect(drain.providerMetadata).toEqual({ anthropic: { foo: "bar" } });
});

test("a stream that ends WITHOUT a finish part fails closed — never an empty success (#1400's class)", async () => {
  const err = await drainStream(streamOf([part({ type: "text-delta", id: "t1", delta: "partial" })]), { label: "the-label" }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ProviderError);
  expect(err).toMatchObject({ kind: "server", retryable: true });
  expect((err as ProviderError).message).toContain("the-label");
  expect((err as ProviderError).message).toContain("truncated");
});

test("an `error` part carrying a real Error is re-thrown UNCHANGED for the caller's classifier", async () => {
  const boom = new Error("upstream exploded");
  const err = await drainStream(streamOf([part({ type: "error", error: boom })]), { label: "test" }).catch((e: unknown) => e);
  expect(err).toBe(boom);
});

test("an `error` part carrying a non-Error value is wrapped in a retryable ProviderError", async () => {
  const err = await drainStream(streamOf([part({ type: "error", error: { code: "boom" } })]), { label: "test" }).catch((e: unknown) => e);
  expect(err).toBeInstanceOf(ProviderError);
  expect(err).toMatchObject({ kind: "server", retryable: true });
});

test("a tool-call part is captured with its raw JSON string input, and a generated image is stamped at its arrival offset in the reply", async () => {
  const inputJson = JSON.stringify({ city: "Paris" });
  const drain = await drainStream(
    streamOf([
      part({ type: "text-delta", id: "t1", delta: "look: " }),
      part({ type: "file", mediaType: "image/png", data: { type: "data", data: "YWJj" } }),
      part({ type: "tool-call", toolCallId: "call_1", toolName: "get_weather", input: inputJson }),
      FINISH,
    ]),
    { label: "test" },
  );
  expect(drain.toolCalls).toEqual([{ toolCallId: "call_1", name: "get_weather", arguments: inputJson }]);
  expect(drain.images).toEqual([{ url: undefined, base64: "YWJj", mediaType: "image/png", atChars: "look: ".length }]);
});
