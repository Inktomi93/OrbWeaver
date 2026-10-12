// backends/openai-compat/chat — the cached prefix across a group round and the connection's prompt-cache settings on the OpenRouter → Anthropic and Gemini routes.

// @orb-waive-file no-test-fabrication(unknown[]): baselined when the gate widened to value casts; burn-down item 906.
import type { PromptCacheSettings } from "@orb/contracts/inference";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { testModelId, testProviderId } from "@orb/testkit/iso/inference-identities.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { fakeApiKeySecret, fakeResolved } from "../../_support.ts";
import { generationCapability } from "../_hosted-support.ts";
import type { OpenAiCompatChatRequest } from "./_chat-support.ts";
import { curatedRows, orRequest, sentBody, synthesizeCapability } from "./_chat-support.ts";

function cachedParts(messages: readonly Record<string, unknown>[]): { readonly entries: readonly string[]; readonly marked: readonly number[] } {
  const entries: string[] = [];
  const marked: number[] = [];
  for (const message of messages) {
    entries.push(`message:${String(message["role"])}`);
    const content = message["content"];
    const parts: Record<string, unknown>[] = typeof content === "string" ? [{ type: "text", text: content }] : [];
    if (Array.isArray(content)) {
      // @orb-waive no-test-fabrication(Record<string, unknown>[]): baselined when the gate widened to value casts; burn-down item 906.
      parts.push(...(content as Record<string, unknown>[]));
    }
    for (const { cache_control: marker, ...part } of parts) {
      if (marker !== undefined) {
        marked.push(entries.length);
      }
      entries.push(JSON.stringify(part));
    }
  }
  return { entries, marked };
}

// SHAPE keeps each stored row of a same-role run its own row when the turn caches by explicit Anthropic markers.
// Rule 10 folds them into one message with one part per row, so the wire alternates and the part the previous
// call marked keeps its bytes and its end when the next speaker's reply lands under it. The gate is the resolved
// capability (`explicitPromptCache`) plus the model family, never the route, and nothing about prefill or the
// trailing cue changes.
const orText = (value: string): [{ type: "text"; text: string }] => [{ type: "text", text: value }];
const ROUND_OPENING = [
  { role: "user", content: orText("We head for the harbor.") },
  { role: "assistant", content: orText("Mira: Mira leads.") },
  { role: "assistant", content: orText("Wren: Wren scouts.") },
] satisfies OpenAiCompatChatRequest["history"];
const KAI_CUE = { role: "user", content: orText("[Write the next reply only as Kai.]") } satisfies OpenAiCompatChatRequest["history"][number];
const CC_1H = { type: "ephemeral", ttl: "1h" };

function roundCall(model: string, assistantPrefill: boolean): (history: OpenAiCompatChatRequest["history"]) => Promise<Record<string, unknown>[]> {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model,
    // The same cell on every case, explicit caching included, so only the model family decides the fold.
    capability: generationCapability({
      turns: {
        assistantPrefill,
        midConversationSystem: false,
        historySystemRows: false,
        roleHandlingFloor: "strict",
        explicitPromptCache: true,
        cacheMinTokens: 1,
      },
    }),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
  });
  return async (history) =>
    // @orb-waive no-test-fabrication(Record<string, unknown>[]): baselined when the gate widened to value casts; burn-down item 906.
    (await sentBody(orRequest({ connection, tools: undefined, cacheBreakpointDepth: 1, history })))["messages"] as Record<string, unknown>[];
}

for (const { model, assistantPrefill } of [
  { model: "anthropic/claude-sonnet-5", assistantPrefill: false },
  { model: "anthropic/claude-opus-4.5", assistantPrefill: true },
]) {
  test(`OR ${model} (prefill ${String(assistantPrefill)}): a three-speaker round is one message of three parts, and the marked prefix repeats`, async () => {
    const call = roundCall(model, assistantPrefill);
    // Kai's call ends on the cue; the next send adds Kai's reply under the block Kai's call marked.
    const kaiTurn = await call([...ROUND_OPENING, KAI_CUE]);
    const nextSend = await call([
      ...ROUND_OPENING,
      { role: "assistant", content: orText("Kai: Kai follows.") },
      { role: "user", content: orText("Board the ship.") },
    ]);

    expect(kaiTurn[2]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Mira: Mira leads." },
        { type: "text", text: "Wren: Wren scouts.", cache_control: CC_1H },
      ],
    });
    expect(nextSend.map((message) => message["role"])).toEqual(["system", "user", "assistant", "user"]);
    expect(nextSend[2]).toEqual({
      role: "assistant",
      content: [
        { type: "text", text: "Mira: Mira leads." },
        { type: "text", text: "Wren: Wren scouts." },
        { type: "text", text: "Kai: Kai follows.", cache_control: CC_1H },
      ],
    });
    const n = cachedParts(kaiTurn);
    const next = cachedParts(nextSend);
    const through = Math.max(...n.marked) + 1;
    expect(next.entries.slice(0, through)).toEqual(n.entries.slice(0, through));
  });
}

test("OR prefill-capable Anthropic model: a run that ends the history folds and keeps its assistant tail", async () => {
  const messages = await roundCall("anthropic/claude-opus-4.5", true)(ROUND_OPENING);
  expect(messages.map((message) => message["role"])).toEqual(["system", "user", "assistant"]);
  expect((messages[2]?.["content"] as unknown[]).length).toBe(2);
});

test("OR non-Anthropic model: the round's rows pass through 1:1 with no history marker, as before", async () => {
  const messages = await roundCall("google/gemini-3-pro", false)([...ROUND_OPENING, KAI_CUE]);
  expect(messages).toEqual([
    { role: "system", content: [{ type: "text", text: "You are a helpful assistant." }] },
    { role: "user", content: "We head for the harbor." },
    { role: "assistant", content: "Mira: Mira leads." },
    { role: "assistant", content: "Wren: Wren scouts." },
    { role: "user", content: "[Write the next reply only as Kai.]" },
  ]);
});

// ── the connection's PROMPT-CACHE settings on the OpenRouter → Anthropic route ────────────────────────────
// The same four settings as the direct wire, pinned on the bytes OpenRouter receives: markers ride content
// PARTS (the only place OpenRouter forwards them), the system is `messages[0]`, and there is no tool marker on
// this route. The Anthropic provider pin is a routing fact, not a cache setting: it stays whatever caching says.

/** Every content-part marker in message order: `[messageIndex, marker]`. */
function orMarkers(body: Record<string, unknown>): readonly (readonly [number, unknown])[] {
  // @orb-waive no-test-fabrication(Record<string, unknown>[]): baselined when the gate widened to value casts; burn-down item 906.
  const messages = Array.isArray(body["messages"]) ? (body["messages"] as Record<string, unknown>[]) : [];
  return messages.flatMap((message, index) =>
    // @orb-waive no-test-fabrication(Record<string, unknown>[]): baselined when the gate widened to value casts; burn-down item 906.
    (Array.isArray(message["content"]) ? (message["content"] as Record<string, unknown>[]) : []).flatMap((part) =>
      part["cache_control"] === undefined ? [] : [[index, part["cache_control"]] as const],
    ),
  );
}

function orCacheTurn(promptCache: PromptCacheSettings, cacheBreakpointDepth = 1): OpenAiCompatChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "openrouter",
    model: "anthropic/claude-sonnet-5",
    capability: generationCapability({
      turns: {
        assistantPrefill: false,
        midConversationSystem: false,
        historySystemRows: false,
        roleHandlingFloor: "strict",
        explicitPromptCache: true,
        cacheMinTokens: 1,
        requestAutomaticPromptCache: true,
      },
    }),
    secret: fakeApiKeySecret("sk-or-not-a-real-key"),
    promptCache,
  });
  return orRequest({
    connection,
    tools: undefined,
    cacheBreakpointDepth,
    history: [
      { role: "user", content: orText("u0") },
      { role: "assistant", content: orText("a0") },
      { role: "user", content: orText("u1") },
      { role: "assistant", content: orText("a1") },
      { role: "user", content: orText("u2") },
      { role: "assistant", content: orText("a2") },
      { role: "user", content: orText("u3") },
    ],
  });
}

test("OpenRouter Anthropic automatic caching carries one root directive and preserves manual routing law", async () => {
  const body = await sentBody(orCacheTurn({ ...SHIPPED_PROMPT_CACHE, requestAutomatic: true, ttl: "1h" }));
  expect(body["cache_control"]).toEqual({ type: "ephemeral", ttl: "1h" });
  expect(orMarkers(body)).toEqual([]);
  expect(body["provider"]).toEqual({ order: ["Anthropic"], allow_fallbacks: false });
});

for (const ttl of ["5m", "1h"] as const) {
  test(`OR prompt cache ttl ${ttl}: the system part and the history pair all carry it`, async () => {
    const markers = orMarkers(await sentBody(orCacheTurn({ ...SHIPPED_PROMPT_CACHE, ttl })));
    // system (0), then depth 3 (a1, index 4) and depth 1 (a2, index 6) — one ttl, so the order rule holds.
    expect(markers.map(([index]) => index)).toEqual([0, 4, 6]);
    for (const [, marker] of markers) {
      expect(marker).toEqual({ type: "ephemeral", ttl });
    }
  });
}

test("OR prompt cache: with the system block off, only the history pair is marked", async () => {
  const body = await sentBody(orCacheTurn({ ...SHIPPED_PROMPT_CACHE, cacheSystem: false }));
  expect(orMarkers(body).map(([index]) => index)).toEqual([4, 6]);
});

test("OR prompt cache OFF: no cache_control in the body, and the Anthropic provider pin is unchanged", async () => {
  const req = orCacheTurn({ ...SHIPPED_PROMPT_CACHE, enabled: false });
  const history = req.history.map((row, index) => (index === 1 ? { ...row, wireMeta: { cacheBreakpoint: true as const } } : row));
  const body = await sentBody({ ...req, history });
  expect(JSON.stringify(body)).not.toContain("cache_control");
  expect(body["provider"]).toEqual({ order: ["Anthropic"], allow_fallbacks: false });
});

test("OR prompt cache depth: the connection's minimum moves the pair deeper, and never shallower than the request's depth", async () => {
  // Request depth 1, user minimum 3 ⇒ depths 3 and 5: a1 (index 4) and a0 (index 2).
  expect(orMarkers(await sentBody(orCacheTurn({ ...SHIPPED_PROMPT_CACHE, historyDepth: 3 }, 1))).map(([index]) => index)).toEqual([0, 2, 4]);
  // Request depth 3 (admin-floored upstream), user minimum 1 ⇒ the request's depth stands.
  expect(orMarkers(await sentBody(orCacheTurn({ ...SHIPPED_PROMPT_CACHE, historyDepth: 1 }, 3))).map(([index]) => index)).toEqual([0, 2, 4]);
});

function geminiCacheTurn(overrides: Partial<PromptCacheSettings> = {}, dynamic = ""): OpenAiCompatChatRequest {
  const model = "google/gemini-2.5-flash";
  const capability = synthesizeCapability("generation", "google", {
    curated: curatedRows({ model, providerId: testProviderId("openrouter"), wire: "openai-compat" }),
  }).capability;
  return orRequest({
    connection: fakeResolved({
      task: "chat",
      providerId: "openrouter",
      model,
      capability,
      secret: fakeApiKeySecret("fake-or-key"),
      promptCache: { ...SHIPPED_PROMPT_CACHE, ...overrides },
    }),
    params: { effort: "none" },
    tools: undefined,
    systemPrompt: { static: "Stable knowledge. ".repeat(1800), dynamic },
    history: orCacheTurn(SHIPPED_PROMPT_CACHE).history,
    cacheBreakpointDepth: 1,
  });
}

test("Gemini OR explicit cache uses its fixed TTL on stable system and history without an Anthropic routing pin", async () => {
  const body = await sentBody(geminiCacheTurn());
  expect(orMarkers(body)).toEqual([
    [0, { type: "ephemeral", ttl: "5m" }],
    [4, { type: "ephemeral", ttl: "5m" }],
    [6, { type: "ephemeral", ttl: "5m" }],
  ]);
  expect(body).not.toHaveProperty("provider");
});

test("Gemini OR preserves the dynamic system position and marks only history; off and insufficient prefixes never mark", async () => {
  const req = geminiCacheTurn({}, "Changing turn context.");
  const body = await sentBody(req);
  expect(orMarkers(body).map(([index]) => index)).toEqual([4, 6]);
  expect(body["messages"]).toEqual(
    expect.arrayContaining([
      { role: "system", content: [{ type: "text", text: req.systemPrompt.static.trim() + "\n\nChanging turn context." }] },
      { role: "user", content: "u0" },
    ]),
  );
  expect(orMarkers(await sentBody(geminiCacheTurn({ enabled: false })))).toEqual([]);
  expect(orMarkers(await sentBody({ ...geminiCacheTurn(), systemPrompt: { static: "small", dynamic: "" } }))).toEqual([]);
  expect(orMarkers(await sentBody(geminiCacheTurn({ cacheSystem: false, historyDepth: 3 }))).map(([index]) => index)).toEqual([2, 4]);
});

test("measured OR Gemini 3.1 Pro prefill remains a final assistant prefix through the SDK", async () => {
  const req = geminiCacheTurn({ enabled: false });
  const model = "google/gemini-3.1-pro-preview";
  const capability = synthesizeCapability("generation", "google", {
    curated: curatedRows({ model, providerId: testProviderId("openrouter"), wire: "openai-compat" }),
  }).capability;
  const body = await sentBody({
    ...req,
    connection: { ...req.connection, model: testModelId(model), capability },
    systemPrompt: { static: "Keep order.", dynamic: "" },
    history: [
      { role: "user", content: orText("Respond: The answer is ORBIT.") },
      { role: "assistant", content: orText("The answer is") },
    ],
  });
  expect(body["messages"]).toMatchObject([{ role: "system" }, { role: "user" }, { role: "assistant", content: "The answer is" }]);
});
