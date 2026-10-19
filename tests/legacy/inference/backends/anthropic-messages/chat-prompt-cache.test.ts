// backends/anthropic-messages/chat — the cached prefix across a group round and the connection's prompt-cache settings, pinned on the BYTES the converter produced.

import type { PromptCacheSettings } from "@orb/contracts/inference";
import { SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { fakeApiKeySecret, fakeResolved } from "../../_support.ts";
import type { RecordedRequest } from "../_hosted-support.ts";
import { anthropicTextStream, generationCapability, scriptedSseFetch } from "../_hosted-support.ts";
import type { AnthropicChatRequest, LogLine } from "./_chat-support.ts";
import { deps, recordedTurn, runAnthropicChatTurn, turnRequest } from "./_chat-support.ts";

// ── the cached prefix across a group round ─────────────────────────────────────────────────────────────────
// SHAPE keeps each stored row of a same-role run its own row on this wire. The SDK must deliver them as one
// message of separate blocks, so the block the previous call marked keeps its bytes and its end when the next
// speaker's reply lands under it.

/** The prompt as the cache reads it: each system and message block in order, tagged with its turn's role, with
 *  the `cache_control` marker set aside (it is not prompt bytes) and reported as the block index it rode on. */
function cachedBlocks(recorded: RecordedRequest | undefined): { readonly blocks: readonly string[]; readonly marked: readonly number[] } {
  const body = recorded?.body ?? {};
  const turns = [{ role: "system", content: body["system"] }, ...(Array.isArray(body["messages"]) ? (body["messages"] as Record<string, unknown>[]) : [])];
  const blocks: string[] = [];
  const marked: number[] = [];
  for (const turn of turns) {
    for (const block of Array.isArray(turn["content"]) ? (turn["content"] as Record<string, unknown>[]) : []) {
      const { cache_control: marker, ...bytes } = block;
      if (marker !== undefined) {
        marked.push(blocks.length);
      }
      blocks.push(JSON.stringify([turn["role"], bytes]));
    }
  }
  return { blocks, marked };
}

test("a group round keeps the block the previous call marked: same bytes, same end, one assistant turn", async () => {
  const connection = fakeResolved({
    task: "chat",
    providerId: "anthropic",
    model: "claude-opus-5",
    capability: generationCapability({
      turns: {
        assistantPrefill: false,
        midConversationSystem: false,
        historySystemRows: false,
        roleHandlingFloor: "strict",
        explicitPromptCache: true,
        cacheMinTokens: 1,
      },
    }),
    baseUrl: "https://api.anthropic.com",
    secret: fakeApiKeySecret("sk-ant-probe-not-a-real-key"),
  });
  const text = (value: string): [{ type: "text"; text: string }] => [{ type: "text", text: value }];
  const call = async (history: AnthropicChatRequest["history"]): Promise<RecordedRequest | undefined> =>
    (await recordedTurn(turnRequest({ connection, tools: undefined, cacheBreakpointDepth: 1, history }), anthropicTextStream("ok"))).body;
  const opening = [
    { role: "user", content: text("We head for the harbor.") },
    { role: "assistant", content: text("Mira: Mira leads.") },
  ] satisfies AnthropicChatRequest["history"];

  const wren = await call([...opening, { role: "user", content: text("[Write the next reply only as Wren.]") }]);
  const kai = await call([
    ...opening,
    { role: "assistant", content: text("Wren: Wren scouts.") },
    { role: "user", content: text("[Write the next reply only as Kai.]") },
  ]);

  const n = cachedBlocks(wren);
  const next = cachedBlocks(kai);
  const deepest = Math.max(...n.marked);
  // System (0) and Mira's block (2) are marked on the first call.
  expect(n.marked).toEqual([0, 2]);
  expect(next.blocks.slice(0, deepest + 1)).toEqual(n.blocks.slice(0, deepest + 1));
  // The run is still ONE assistant turn on the wire, made of two blocks, and the marker moved to the newest one.
  const messages = kai?.body["messages"] as Record<string, unknown>[];
  expect(messages.map((message) => message["role"])).toEqual(["user", "assistant", "user"]);
  expect(messages[1]?.["content"]).toEqual([
    { type: "text", text: "Mira: Mira leads." },
    { type: "text", text: "Wren: Wren scouts.", cache_control: { type: "ephemeral", ttl: "1h" } },
  ]);
});

// The SDK behavior the layout above rests on (`@ai-sdk/anthropic` groupIntoBlocks): adjacent same-role rows become
// one message, and a row's own marker stays on that row's last block even when a later row joins the message. An
// SDK bump that joins the rows or moves the marker to the message's end reds here.
test("SDK pin: adjacent same-role rows group into one message and each row's marker stays on its own last block", async () => {
  const text = (value: string): { type: "text"; text: string } => ({ type: "text", text: value });
  const { body } = await recordedTurn(
    turnRequest({
      tools: undefined,
      history: [
        { role: "user", content: [text("We head for the harbor.")] },
        { role: "assistant", content: [text("Mira: "), text("Mira leads.")], wireMeta: { cacheBreakpoint: true } },
        { role: "assistant", content: [text("Wren: Wren scouts.")] },
        { role: "user", content: [text("[Write the next reply only as Kai.]")] },
      ],
    }),
    anthropicTextStream("ok"),
  );
  const messages = body?.body["messages"] as Record<string, unknown>[];
  expect(messages.map((message) => message["role"])).toEqual(["user", "assistant", "user"]);
  expect(messages[1]?.["content"]).toEqual([
    { type: "text", text: "Mira: " },
    { type: "text", text: "Mira leads.", cache_control: { type: "ephemeral", ttl: "1h" } },
    { type: "text", text: "Wren: Wren scouts." },
  ]);
});

// ── the connection's PROMPT-CACHE settings on the direct wire ──────────────────────────────────────────────
// Each setting is pinned on the BYTES the converter produced. The walk reads every marker in Anthropic's prefix
// order — tools, then the system blocks, then the messages — because that is the order the TTL rule is stated
// in: a longer-TTL breakpoint must come before any shorter one, so a 1h marker may never follow a 5m one.

const TTL_RANK: Readonly<Record<string, number>> = { "1h": 2, "5m": 1 };

interface WireMarker {
  readonly at: string;
  readonly marker: unknown;
}

/** Every `cache_control` the body carries, in prefix order, tagged with where it rode. */
function markersInPrefixOrder(recorded: RecordedRequest | undefined): readonly WireMarker[] {
  const body = recorded?.body ?? {};
  const found: WireMarker[] = [];
  const blocksOf = (value: unknown): readonly Record<string, unknown>[] => (Array.isArray(value) ? (value as Record<string, unknown>[]) : []);
  for (const [index, tool] of blocksOf(body["tools"]).entries()) {
    if (tool["cache_control"] !== undefined) {
      found.push({ at: `tool:${String(index)}`, marker: tool["cache_control"] });
    }
  }
  for (const block of blocksOf(body["system"])) {
    if (block["cache_control"] !== undefined) {
      found.push({ at: "system", marker: block["cache_control"] });
    }
  }
  for (const [index, message] of blocksOf(body["messages"]).entries()) {
    for (const block of blocksOf(message["content"])) {
      if (block["cache_control"] !== undefined) {
        found.push({ at: `message:${String(index)}`, marker: block["cache_control"] });
      }
    }
  }
  return found;
}

/** No marker is followed by one with a LONGER ttl (the API's order rule). */
function ttlOrderHolds(markers: readonly WireMarker[]): boolean {
  const ranks = markers.map(({ marker }) => TTL_RANK[String((marker as { ttl?: unknown }).ttl)] ?? 0);
  return ranks.every((rank, index) => index === 0 || rank <= (ranks[index - 1] ?? 0));
}

/** The `anthropic-beta` entries a request carried, or none. */
function betasOf(recorded: RecordedRequest | undefined): readonly string[] {
  const header = recorded?.headers?.["anthropic-beta"];
  return header === undefined ? [] : header.split(",").map((beta) => beta.trim());
}

const CACHE_TTL_BETA = /cache-ttl/iu;

test("automatic Anthropic caching carries one request-wide directive without manual breakpoints", async () => {
  const body = (await recordedTurn(cacheTurn({ ...SHIPPED_PROMPT_CACHE, requestAutomatic: true, ttl: "1h" }), anthropicTextStream("ok"))).body;
  expect(body?.body["cache_control"]).toEqual({ type: "ephemeral", ttl: "1h" });
  expect(markersInPrefixOrder(body)).toEqual([]);
  const off = (await recordedTurn(cacheTurn({ ...SHIPPED_PROMPT_CACHE, enabled: false }), anthropicTextStream("ok"))).body;
  expect(off?.body).not.toHaveProperty("cache_control");
  expect(markersInPrefixOrder(off)).toEqual([]);
});

/** A direct Anthropic turn over a six-row history with two tools, cacheable at any depth (floor 1 token). */
function cacheTurn(promptCache: PromptCacheSettings, cacheBreakpointDepth = 1): AnthropicChatRequest {
  const connection = fakeResolved({
    task: "chat",
    providerId: "anthropic",
    model: "claude-opus-5",
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
    baseUrl: "https://api.anthropic.com",
    secret: fakeApiKeySecret("sk-ant-probe-not-a-real-key"),
    promptCache,
  });
  const text = (value: string): [{ type: "text"; text: string }] => [{ type: "text", text: value }];
  return turnRequest({
    connection,
    cacheBreakpointDepth,
    tools: [
      { name: "tick_clock", description: "d", parameters: { type: "object" } },
      { name: "roll_dice", description: "d", parameters: { type: "object" } },
    ],
    history: [
      { role: "user", content: text("u0") },
      { role: "assistant", content: text("a0") },
      { role: "user", content: text("u1") },
      { role: "assistant", content: text("a1") },
      { role: "user", content: text("u2") },
      { role: "assistant", content: text("a2") },
      { role: "user", content: text("u3") },
    ],
  });
}

for (const ttl of ["5m", "1h"] as const) {
  test(`prompt cache ttl ${ttl}: every marker on the direct wire carries it, in a legal TTL order, with no cache-ttl beta`, async () => {
    const { body } = await recordedTurn(cacheTurn({ ...SHIPPED_PROMPT_CACHE, ttl }), anthropicTextStream("ok"));
    const markers = markersInPrefixOrder(body);
    // The last tool, the static system block, and the history pair at depths 1 and 3 (a2 and a1).
    expect(markers.map(({ at }) => at)).toEqual(["tool:1", "system", "message:3", "message:5"]);
    for (const { marker } of markers) {
      expect(marker).toEqual({ type: "ephemeral", ttl });
    }
    expect(ttlOrderHolds(markers)).toBe(true);
    // No beta header is required for either TTL (Anthropic docs). Positive control: the matcher
    // does catch the beta the old note claimed a direct 1h needed.
    expect(betasOf(body).filter((beta) => CACHE_TTL_BETA.test(beta))).toEqual([]);
    expect(
      betasOf({ url: "", body: {}, headers: { "anthropic-beta": "a-beta, extended-cache-ttl-2025-04-11" } }).some((beta) => CACHE_TTL_BETA.test(beta)),
    ).toBe(true);
  });
}

test("the TTL order check reds on a 5m marker ahead of a 1h one (the rule the one-ttl plan exists to keep)", () => {
  const five = { type: "ephemeral", ttl: "5m" };
  const hour = { type: "ephemeral", ttl: "1h" };
  expect(
    ttlOrderHolds([
      { at: "tool:0", marker: hour },
      { at: "system", marker: five },
    ]),
  ).toBe(true);
  expect(
    ttlOrderHolds([
      { at: "tool:0", marker: five },
      { at: "system", marker: hour },
    ]),
  ).toBe(false);
});

test("prompt cache: with the system block off, the system carries no marker and the tools and history keep theirs", async () => {
  const { body } = await recordedTurn(cacheTurn({ ...SHIPPED_PROMPT_CACHE, cacheSystem: false }), anthropicTextStream("ok"));
  expect(markersInPrefixOrder(body).map(({ at }) => at)).toEqual(["tool:1", "message:3", "message:5"]);
  const system = body?.body["system"] as Record<string, unknown>[];
  expect(system).toEqual([{ type: "text", text: "You are a helpful assistant." }]);
});

test("prompt cache OFF: no cache_control anywhere — not the tools, the system, the history, nor a wireMeta row", async () => {
  const lines: LogLine[] = [];
  const req = cacheTurn({ ...SHIPPED_PROMPT_CACHE, enabled: false });
  // A row the assembly flagged as a breakpoint of its own: caching off silences it too.
  const history = req.history.map((row, index) => (index === 1 ? { ...row, wireMeta: { cacheBreakpoint: true as const } } : row));
  const recorded: RecordedRequest[] = [];
  await runAnthropicChatTurn({ ...req, history }, deps(scriptedSseFetch([anthropicTextStream("ok")], recorded), lines));
  expect(markersInPrefixOrder(recorded[0])).toEqual([]);
  expect(JSON.stringify(recorded[0]?.body)).not.toContain("cache_control");
  expect(lines.find((line) => line.fields["event"] === "provider.cache")?.fields["breakpointsPlaced"]).toBe(0);
});

test("prompt cache depth: the connection's minimum moves the history pair deeper, and never shallower than the request's depth", async () => {
  // Request depth 1 (SHAPE's), user minimum 3 ⇒ the pair sits at depths 3 and 5: a1 (message 3) and a0 (message 1).
  const deeper = markersInPrefixOrder((await recordedTurn(cacheTurn({ ...SHIPPED_PROMPT_CACHE, historyDepth: 3 }, 1), anthropicTextStream("ok"))).body);
  expect(deeper.map(({ at }) => at)).toEqual(["tool:1", "system", "message:1", "message:3"]);
  // Request depth 3 (already floored by the admin `promptCacheMinDepth` upstream), user minimum 1 ⇒ the
  // request's depth stands: the user value is bounded below by it.
  const floored = markersInPrefixOrder((await recordedTurn(cacheTurn({ ...SHIPPED_PROMPT_CACHE, historyDepth: 1 }, 3), anthropicTextStream("ok"))).body);
  expect(floored.map(({ at }) => at)).toEqual(["tool:1", "system", "message:1", "message:3"]);
});
