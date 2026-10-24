// @subject packages/server/src/domain/chat/engine/engine.ts
// @subject packages/server/src/domain/chat/verbs/compaction.ts
// Native executable receipts distinguish app-owned markers from foreground dispatch through the real root.
import { createCharacterSchema } from "@orb/contracts/character";
import type { UserIntent } from "@orb/contracts/preset";
import { DEFAULT_COMPACT_INSTRUCTIONS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { initTracing, recentTraces, withRequestSpan } from "@orb/server/foundation/observability";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL } from "@orb/testkit/node/composed";
import { sdkEngineRoom } from "./engine-physical.ts";
import { ENGINE_SDK_MARKER, ENGINE_SDK_MODEL, ENGINE_SDK_REPLY } from "./engine-sdk-physical.mjs";

import { firstCompactingRows } from "./managed-compaction.fixtures.ts";

const SMALL_INTENT = { compaction: { mode: "managed" }, maxContextTokens: 200, maxOutputTokens: 64 } as const satisfies UserIntent;
const PRESET_PARAMS = { ...DEFAULT_PROMPT_CONFIG.params, ...SMALL_INTENT };

test("agent-sdk fit drops rebuild the durable marker through the chat's own native model", async () => {
  await using fixture = await sdkEngineRoom({ history: 8 });
  expect((await fixture.turn(SMALL_INTENT)).aborted).toBe(false);
  await fixture.h.root.settleBackground();
  expect(await fixture.marker()).toMatchObject({ compactSummary: ENGINE_SDK_MARKER, compactedAtSeq: expect.any(Number) });
  expect((await fixture.marker()).compactedAtSeq).toBeGreaterThan(0);
  const markerRequest = fixture.receipts.find(({ marker }) => marker);
  expect(markerRequest).toBeDefined();
  expect(markerRequest?.argv.join(" ")).toContain(ENGINE_SDK_MODEL);
  expect(markerRequest?.prompt).toContain("Conversation to summarize:");
  expect(markerRequest?.prompt).toContain("turn 1 —");
  expect(fixture.receipts.filter(({ marker }) => !marker)).toHaveLength(1);
});

test("the detached post-turn marker opens its own successful request trace", async () => {
  initTracing();
  await using fixture = await sdkEngineRoom({ history: 8 });
  const before = new Set(recentTraces(50).map(({ requestId }) => requestId));
  const outer = `controlled-foreground-compaction:${fixture.h.chatId}`;
  expect((await withRequestSpan(outer, "controlled public generate", {}, () => fixture.turn(SMALL_INTENT))).aborted).toBe(false);
  await fixture.h.root.settleBackground();
  expect(await fixture.marker()).toMatchObject({ compactSummary: ENGINE_SDK_MARKER });
  const traces = recentTraces(50).filter(
    (trace) =>
      !before.has(trace.requestId) &&
      trace.rootName === "chat.managedCompaction" &&
      trace.spans.some((span) => span.name === "chat.managedCompaction" && span.attributes["chatId"] === fixture.h.chatId),
  );
  expect(traces).toHaveLength(1);
  const currentTrace = traces[0];
  const root = currentTrace?.spans.find((span) => span.name === "chat.managedCompaction" && span.attributes["chatId"] === fixture.h.chatId);
  expect(root).toBeDefined();
  const turnId = typeIdSchema(ID_PREFIX.chatTurn).parse(root?.attributes["turnId"]);
  expect(currentTrace).toMatchObject({ status: "ok", requestId: expect.stringMatching(/^compaction-turn:/u) });
  expect(currentTrace?.requestId).toBe(`compaction-turn:${turnId}`);
  expect(root?.parentSpanId).toBeUndefined();
  expect(currentTrace?.requestId).not.toBe(outer);
});

test("the active preset's mode, threshold and cap drive compaction with an empty per-send intent", async () => {
  await using fixture = await sdkEngineRoom({
    history: 16,
    promptConfig: makePromptConfig({ params: { ...PRESET_PARAMS, maxContextTokens: 400, compaction: { mode: "managed", thresholdPct: 0.5 } } }),
  });
  expect((await fixture.turn({})).aborted).toBe(false);
  await fixture.h.root.settleBackground();
  expect(await fixture.marker()).toMatchObject({ compactSummary: ENGINE_SDK_MARKER });
  expect((await fixture.marker()).compactedAtSeq).toBeGreaterThan(0);
});

test("an active preset under its own threshold leaves both marker and physical marker requests absent", async () => {
  await using fixture = await sdkEngineRoom({
    history: 4,
    promptConfig: makePromptConfig({ params: { ...DEFAULT_PROMPT_CONFIG.params, maxOutputTokens: 64, compaction: { mode: "managed" } } }),
  });
  expect((await fixture.turn({})).aborted).toBe(false);
  await fixture.h.root.settleBackground();
  expect(fixture.receipts.filter(({ marker }) => marker)).toEqual([]);
  expect((await fixture.marker()).compactSummary).toBeNull();
});

test("an over-threshold doomed foreground still has a durable pre-dispatch marker", async () => {
  await using fixture = await sdkEngineRoom({ history: 16, policy: { foreground: "fail" } });
  await expect(fixture.turn(SMALL_INTENT)).toThrowProviderError("server");
  expect(await fixture.marker()).toMatchObject({ compactSummary: ENGINE_SDK_MARKER });
  expect((await fixture.marker()).compactedAtSeq).toBeGreaterThan(0);
  expect(fixture.receipts.map(({ marker }) => marker)).toEqual([true, false]);
});

test("verbatimTail4 covers exactly twelve of sixteen real canon rows before a doomed dispatch", async () => {
  await using fixture = await sdkEngineRoom({ history: 16, policy: { foreground: "fail" } });
  await expect(fixture.turn({ ...SMALL_INTENT, compaction: { mode: "managed", verbatimTail: 4 } })).toThrowProviderError("server");
  expect(await fixture.marker()).toMatchObject({ compactSummary: ENGINE_SDK_MARKER, compactedAtSeq: await fixture.seqOfRow(12) });
  expect(fixture.receipts.map(({ marker }) => marker)).toEqual([true, false]);
});

let measuredPreThreshold: Promise<number> | undefined;
function preThreshold(): Promise<number> {
  measuredPreThreshold ??= firstCompactingRows({ foregroundFails: true });
  return measuredPreThreshold;
}

for (const offset of [-1, 0]) {
  test(`the actual pre-turn threshold ${offset === -1 ? "one-row-short refusal" : "crossing row"} is stable`, async () => {
    const threshold = await preThreshold();
    await using fixture = await sdkEngineRoom({
      history: threshold + offset,
      window: 8192,
      policy: { foreground: "fail" },
      promptConfig: makePromptConfig({ params: { ...DEFAULT_PROMPT_CONFIG.params, maxOutputTokens: 100, compaction: { mode: "managed" } } }),
    });
    await expect(fixture.turn()).toThrowProviderError("server");
    expect((await fixture.marker()).compactSummary).toBe(offset === -1 ? null : ENGINE_SDK_MARKER);
    expect(fixture.receipts.filter(({ marker }) => marker)).toHaveLength(offset === -1 ? 0 : 1);
  });
}

test("a failed physical pre-turn marker cannot prevent a successful foreground commit", async () => {
  await using fixture = await sdkEngineRoom({ history: 8, policy: { marker: "fail" } });
  const outcome = await fixture.turn(SMALL_INTENT);
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ content: ENGINE_SDK_REPLY }]);
  await fixture.h.root.settleBackground();
  expect((await fixture.marker()).compactSummary).toBeNull();
  expect(fixture.receipts.some(({ marker }) => marker)).toBe(true);
});

test("a permanent marker outage cannot wall a real over-window turn: trim, warn, commit and leave no marker", async () => {
  await using fixture = await sdkEngineRoom({ history: 16, window: 300, policy: { marker: "fail" } });
  const preview = await fixture.h.caller.chat.previewContextFit({ chatId: fixture.h.chatId });
  expect(preview).toMatchObject({ droppedCount: expect.any(Number), limit: { kind: "window", tokens: 300 } });
  if ("unbound" in preview) {
    throw new Error("the real SDK room lost its binding");
  }
  expect(preview.droppedCount).toBeGreaterThan(0);
  const outcome = await fixture.turn({ compaction: { mode: "managed" }, maxOutputTokens: 64 });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ content: ENGINE_SDK_REPLY }]);
  await fixture.h.root.settleBackground();
  expect((await fixture.marker()).compactSummary).toBeNull();
  expect(await fixture.warnings()).toContainEqual(expect.objectContaining({ code: "context_trimmed_no_summary" }));
});

for (const descriptionWords of [0, 2000]) {
  test(`a ${descriptionWords}-word real card retains the actual fit-trim/no-summary warning premise`, async ({ annotate }) => {
    await using fixture = await sdkEngineRoom({
      history: 160,
      window: 8000,
      policy: { marker: "fail", inspectHistory: true },
      characters: [createCharacterSchema.parse({ handle: "trim-keeper", name: "Aria", description: "word ".repeat(descriptionWords) })],
      promptConfig: makePromptConfig({ params: { ...DEFAULT_PROMPT_CONFIG.params, maxOutputTokens: 100 } }),
    });
    const preview = await fixture.h.caller.chat.previewContextFit({ chatId: fixture.h.chatId });
    if ("unbound" in preview) {
      throw new Error("the real trim room lost its binding");
    }
    expect(preview.droppedCount).toBeGreaterThan(0);
    expect(preview.droppedCount).toBeLessThan(160);
    expect((await fixture.turn()).aborted).toBe(false);
    await fixture.h.root.settleBackground();
    const request = fixture.receipts.find(({ marker }) => !marker);
    expect(request).toBeDefined();
    expect(request?.importedSeed).toBeDefined();
    expect(request?.importedSeed?.rowCount).toBeGreaterThan(0);
    expect(request?.importedSeed?.rowCount).toBeLessThan(160);
    expect(request?.argv).toContain(`--resume=${request?.importedSeed?.sessionId}`);
    expect(request?.importedSeed?.lastText).toContain("turn 160 —");
    expect(request?.importedSeed?.firstText).not.toContain("turn 1 —");
    expect(await fixture.warnings()).toContainEqual(expect.objectContaining({ code: "context_trimmed_no_summary" }));
    expect((await fixture.marker()).compactSummary).toBeNull();
    await annotate(
      JSON.stringify({ descriptionWords, importedRows: request?.importedSeed?.rowCount, sessionId: request?.importedSeed?.sessionId }),
      "native-materialized-history",
    );
  });
}

test("the stateless route under the same blown fit never requests or stamps a managed marker", async () => {
  await using fixture = await sdkEngineRoom({ history: 16 });
  const stateless = await fixture.h.root.services.connection.create({
    principal: fixture.h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: { kind: "generation", generation: { context: { window: 32_000 } }, features: { detectServer: false } },
  });
  await fixture.h.caller.connection.setBinding({ task: "chat", connectionId: stateless.id });
  const outcome = await fixture.turn(SMALL_INTENT);
  expect(outcome.aborted).toBe(false);
  await fixture.h.root.settleBackground();
  expect(fixture.receipts).toEqual([]);
  expect(fixture.h.requests.some((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"))).toBe(true);
  expect((await fixture.marker()).compactSummary).toBeNull();
});

test("SDK auto mode never runs the app's marker generation even when the fit drops canon", async () => {
  await using fixture = await sdkEngineRoom({ history: 8 });
  expect((await fixture.turn({ ...SMALL_INTENT, compaction: { mode: "auto" } })).aborted).toBe(false);
  await fixture.h.root.settleBackground();
  expect(fixture.receipts.filter(({ marker }) => marker)).toEqual([]);
  expect((await fixture.marker()).compactSummary).toBeNull();
});

test("no fit drop and usage below threshold leave managed compaction idle", async () => {
  await using fixture = await sdkEngineRoom({ history: 4 });
  expect((await fixture.turn({ compaction: { mode: "managed" }, maxOutputTokens: 64 })).aborted).toBe(false);
  await fixture.h.root.settleBackground();
  expect(fixture.receipts.filter(({ marker }) => marker)).toEqual([]);
  expect((await fixture.marker()).compactSummary).toBeNull();
});

test("tiny native per-call token deltas cannot blind cumulative managed fit usage", async () => {
  await using fixture = await sdkEngineRoom({ history: 8, window: 200_000, policy: { inputTokens: 2 } });
  const outcome = await fixture.turn(SMALL_INTENT);
  expect(outcome.aborted).toBe(false);
  await fixture.h.root.settleBackground();
  expect(await fixture.marker()).toMatchObject({ compactSummary: ENGINE_SDK_MARKER });
  const assistant = outcome.messages[0];
  expect(assistant?.tokensIn).toBe(2);
  expect((await fixture.marker()).compactedAtSeq).toBeGreaterThan(0);
});

test("the public manual lever at unchanged durable coverage generates nothing and reports updated:false", async () => {
  await using fixture = await sdkEngineRoom({ history: 8 });
  const first = await fixture.h.root.services.chat.compact({ principal: fixture.h.owner, chatId: fixture.h.chatId });
  expect(first.updated).toBe(true);
  expect(first.compactedAtSeq).toBe(await fixture.seqOfRow(8));
  const calls = fixture.receipts.length;
  expect(await fixture.h.root.services.chat.compact({ principal: fixture.h.owner, chatId: fixture.h.chatId })).toEqual({ ...first, updated: false });
  expect(fixture.receipts).toHaveLength(calls);
});

test("a held physical post-turn marker remains single-flight across the next real turn", async () => {
  await using fixture = await sdkEngineRoom({ history: 8, policy: { marker: "hold" } });
  try {
    expect((await fixture.turn(SMALL_INTENT)).aborted).toBe(false);
    await expect.poll(() => fixture.held.size).toBe(1);
    expect(fixture.receipts.filter(({ marker }) => marker)).toHaveLength(1);
    expect((await fixture.turn(SMALL_INTENT)).aborted).toBe(false);
    expect(fixture.held.size).toBe(1);
    expect(fixture.receipts.filter(({ marker }) => marker)).toHaveLength(1);
  } finally {
    fixture.release();
  }
  await fixture.h.root.settleBackground();
  expect(fixture.held.size).toBe(0);
  expect(await fixture.marker()).toMatchObject({ compactSummary: ENGINE_SDK_MARKER });
});

test("configured compaction instructions reach the actual marker prompt instead of the default", async () => {
  await using fixture = await sdkEngineRoom({ history: 16 });
  expect((await fixture.turn({ ...SMALL_INTENT, compaction: { mode: "managed", instructions: "CUSTOM-STEER-XYZ" } })).aborted).toBe(false);
  await fixture.h.root.settleBackground();
  const prompt = fixture.receipts.find(({ marker }) => marker)?.prompt;
  expect(prompt).toContain("CUSTOM-STEER-XYZ");
  expect(prompt).toContain("turn 1 —");
  expect(prompt).not.toContain(DEFAULT_COMPACT_INSTRUCTIONS);
});

test("owner cancellation stops the held physical pre-turn marker and never dispatches foreground", async () => {
  await using fixture = await sdkEngineRoom({ history: 16, policy: { marker: "hold" } });
  const running = fixture.turn(SMALL_INTENT);
  const settled = Promise.allSettled([running]);
  try {
    await expect.poll(() => fixture.held.size).toBe(1);
    expect(fixture.receipts.map(({ marker }) => marker)).toEqual([true]);
    await fixture.h.root.services.chat.abort({ principal: fixture.h.owner, chatId: fixture.h.chatId });
    expect(await running).toMatchObject({ aborted: true, abortReason: "user" });
    await expect.poll(() => fixture.held.size).toBe(0);
    expect(fixture.receipts.filter(({ marker }) => !marker)).toEqual([]);
    expect((await fixture.marker()).compactSummary).toBeNull();
  } finally {
    fixture.release();
    await settled;
  }
});

test("a native marker throw with a live caller is failure, not cancellation, and foreground still commits", async () => {
  await using fixture = await sdkEngineRoom({ history: 16, policy: { marker: "fail" } });
  const outcome = await fixture.turn(SMALL_INTENT);
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ content: ENGINE_SDK_REPLY }]);
  await fixture.h.root.settleBackground();
  expect(fixture.receipts.some(({ marker }) => marker)).toBe(true);
  expect(fixture.receipts.filter(({ marker }) => !marker)).toHaveLength(1);
  expect((await fixture.marker()).compactSummary).toBeNull();
});
