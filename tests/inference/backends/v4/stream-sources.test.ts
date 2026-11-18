// @subject packages/inference/src/backends/v4/stream.ts
// @subject packages/inference/src/backends/v4/result.ts
// The fold keeps every source a wire cited, on ONE offset frame: the reply. The two arrival forms are the
// `source` stream part (OpenRouter) and the `citations` list on a text block's `text-end` (Anthropic), and the
// fixtures below are copied from the installed providers' own emit sites, not from the design table:
//   · OpenRouter — `@openrouter/ai-sdk-provider@3.1.0 dist/index.js:4782-4798` enqueues
//     `{type:"source", sourceType:"url", url, title: x ?? "", providerMetadata:{openrouter:{content: x ?? "",
//     startIndex: x ?? 0, endIndex: x ?? 0}}}` for each `url_citation` annotation.
//   · Anthropic — `@ai-sdk/anthropic@4.0.85 dist/index.js:4932-4940` attaches `contentBlock.citations.map(
//     mapAnthropicCitation)` to `text-end`, and `:68-96` builds `{source, citedText}` with NO `startIndex`/
//     `endIndex` at all (the design table's "index relative to that block" column is not what the dist emits —
//     recorded in docs/plans/source-parts-storage/design.md's landing evidence).
//   · Anthropic's bare `source` part is the SAME citation again (`:5057-5065`, and the web-search fallback at
//     `:5201-5204`), so the fold keeps the block-associated copy and skips the bare one.

import { makeGenerationCapability, testModelId, testProviderId } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { toChatResult } from "#inference/backends/v4/result.ts";
import { drainStream } from "#inference/backends/v4/stream.ts";

type StreamPart = Parameters<typeof drainStream>[0] extends ReadableStream<infer T> ? T : never;
type ResultContext = Parameters<typeof toChatResult>[1];

const USAGE = {
  inputTokens: { total: 11, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 4, text: 4, reasoning: undefined },
} as const;

const FINISH = { type: "finish", finishReason: { unified: "stop", raw: "end_turn" }, usage: USAGE } as const;

function drain(parts: readonly StreamPart[]): ReturnType<typeof drainStream> {
  const stream = new ReadableStream<StreamPart>({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }
      controller.close();
    },
  });
  return drainStream(stream, { label: "fixture" });
}

function resultContext(): ResultContext {
  return {
    model: testModelId("openrouter/test-model"),
    providerId: testProviderId("openrouter"),
    providerMetadataKey: "openrouter",
    generation: makeGenerationCapability(),
    maxOutputTokens: 1024,
    startedAt: 0,
    firstDeltaAt: undefined,
    now: 1,
    measuredCost: null,
    pricing: undefined,
    generationId: null,
    appliedEffort: null,
    rateLimit: null,
    warnings: [],
  };
}

function openRouterSource(overrides: { title?: string; content?: string; startIndex?: number; endIndex?: number } = {}): StreamPart {
  return {
    type: "source",
    sourceType: "url",
    id: "https://example.test/one",
    url: "https://example.test/one",
    title: overrides.title ?? "One",
    providerMetadata: {
      openrouter: {
        content: overrides.content ?? "the cited passage",
        startIndex: overrides.startIndex ?? 0,
        endIndex: overrides.endIndex ?? 0,
      },
    },
  } as const;
}

test("an OpenRouter source part becomes one entry with its narrowed span in reply offsets", async () => {
  const drained = await drain([
    { type: "text-start", id: "0" },
    { type: "text-delta", id: "0", delta: "Alpha beta." },
    { type: "text-end", id: "0" },
    openRouterSource({ startIndex: 6, endIndex: 10 }),
    FINISH,
  ]);
  expect(drained.sources).toEqual([{ url: "https://example.test/one", title: "One", atChars: 6, endChars: 10, citedText: "the cited passage" }]);
});

// The installed provider states no index (dist/index.js:68-96), so the only offset it gives is the block the
// citation supports. A citation of the SECOND block must land after the prose in front of that block, not at
// the reply's start — this is the block-relative → reply-absolute shift the fold owns.
test("an Anthropic text-end citation with no wire index is placed where its block opened", async () => {
  const drained = await drain([
    { type: "text-start", id: "0" },
    { type: "text-delta", id: "0", delta: "Intro. " },
    { type: "text-end", id: "0" },
    { type: "text-start", id: "1" },
    { type: "text-delta", id: "1", delta: "Weather today." },
    {
      type: "text-end",
      id: "1",
      citations: [
        {
          source: {
            type: "source",
            sourceType: "url",
            id: "https://example.test/forecast",
            url: "https://example.test/forecast",
            title: "Forecast",
            providerMetadata: { anthropic: { type: "web_search_result_location" } },
          },
          citedText: "Weather today.",
        },
      ],
    },
    FINISH,
  ]);
  expect(drained.sources).toEqual([{ url: "https://example.test/forecast", title: "Forecast", atChars: 7, citedText: "Weather today." }]);
});

// The SDK's own contract (LanguageModelV4Citation: "start offset in the containing generated text"), which a
// wire that supplies indices must be read through: the index is block-relative, so the block's arrival point
// still shifts it into the reply.
test("a wire-supplied text-end span is shifted by the block it belongs to", async () => {
  const drained = await drain([
    { type: "text-start", id: "0" },
    { type: "text-delta", id: "0", delta: "Intro. " },
    { type: "text-end", id: "0" },
    { type: "text-start", id: "1" },
    { type: "text-delta", id: "1", delta: "See here." },
    {
      type: "text-end",
      id: "1",
      citations: [
        {
          source: { type: "source", sourceType: "url", id: "https://example.test/sdk", url: "https://example.test/sdk" },
          startIndex: 4,
          endIndex: 9,
        },
      ],
    },
    FINISH,
  ]);
  expect(drained.sources).toEqual([{ url: "https://example.test/sdk", atChars: 11, endChars: 16 }]);
});

// OpenRouter substitutes `?? ""` for a missing title and content and `?? 0` for a missing index
// (dist/index.js:4790-4795), so all three readings mean "the wire supplied none".
test("a source part's empty title, empty passage and zero-width span all read as absent", async () => {
  const drained = await drain([
    { type: "text-start", id: "0" },
    { type: "text-delta", id: "0", delta: "Answer." },
    { type: "text-end", id: "0" },
    openRouterSource({ title: "", content: "", startIndex: 0, endIndex: 0 }),
    FINISH,
  ]);
  expect(drained.sources).toEqual([{ url: "https://example.test/one", atChars: 7 }]);
});

// No producer in this graph builds a document source (see the contract's refused-member comment), so one that
// arrives anyway must not fault the turn and must not displace the url source beside it.
test("a document-typed source part adds no entry and the url part beside it still does", async () => {
  const drained = await drain([
    { type: "text-start", id: "0" },
    { type: "text-delta", id: "0", delta: "Answer." },
    { type: "text-end", id: "0" },
    {
      type: "source",
      sourceType: "document",
      id: "doc-1",
      mediaType: "application/pdf",
      title: "A PDF",
    },
    openRouterSource({ startIndex: 0, endIndex: 6 }),
    FINISH,
  ]);
  expect(drained.sources.map((source) => source.url)).toEqual(["https://example.test/one"]);
});

// Anthropic's bare source part repeats a citation the block's `text-end` already carried (dist/index.js:
// 5057-5065, :5201-5204), and both carry `providerMetadata.anthropic`. Keeping both would double-count the
// same cited text; the block copy is the one that can be placed.
test("an Anthropic bare source part is skipped because its block's text-end already carried it", async () => {
  const drained = await drain([
    { type: "text-start", id: "0" },
    { type: "text-delta", id: "0", delta: "Cited prose." },
    {
      type: "source",
      sourceType: "url",
      id: "bare-1",
      url: "https://example.test/dup",
      providerMetadata: { anthropic: { citedText: "Cited prose." } },
    },
    {
      type: "text-end",
      id: "0",
      citations: [
        {
          source: {
            type: "source",
            sourceType: "url",
            id: "https://example.test/dup",
            url: "https://example.test/dup",
            providerMetadata: { anthropic: { type: "web_search_result_location" } },
          },
          citedText: "Cited prose.",
        },
      ],
    },
    FINISH,
  ]);
  expect(drained.sources).toEqual([{ url: "https://example.test/dup", atChars: 0, citedText: "Cited prose." }]);
});

// `ChatResult.sources` follows the textSignatures/reasoningParts discipline: absent when the turn cited
// nothing, present otherwise. The second half is the positive control — without it, an absent key would pass
// on a result that never carried the field at all.
test("a turn that cited nothing reports no sources key; one that cited reports the list", async () => {
  const cited = await drain([
    { type: "text-start", id: "0" },
    { type: "text-delta", id: "0", delta: "Alpha beta." },
    { type: "text-end", id: "0" },
    openRouterSource({ startIndex: 0, endIndex: 5 }),
    FINISH,
  ]);
  const bare = await drain([{ type: "text-start", id: "0" }, { type: "text-delta", id: "0", delta: "Alpha beta." }, { type: "text-end", id: "0" }, FINISH]);
  expect(Object.hasOwn(toChatResult(cited, resultContext()), "sources")).toBe(true);
  expect(Object.hasOwn(toChatResult(bare, resultContext()), "sources")).toBe(false);
});
