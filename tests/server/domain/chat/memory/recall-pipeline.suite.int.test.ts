// The recall pipeline through the composed root: the mode switch, the pool stages, the verdict ledger and the knobs.
// Digests come from the production memory build over a transcript; only the provider embedding edge is scripted, so a
// scan runs the real cosine. Each turn's trace is read from the recall recorder the root composes.
// @subject packages/server/src/domain/chat/memory/recall/recall.ts

import { streamConnectInputSchema } from "@orb/contracts/stream";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  captureCookieAuth,
  createChatRoot,
  createCorpusProviderExecution,
  readRoomCanon,
} from "@orb/testkit/node/composed";
import { z } from "zod";
import {
  ARCS,
  admitted,
  ask,
  BLOCK_SIZE,
  blockOf,
  embeddingFor,
  FAN_OUT,
  generatedText,
  OFF_CORPUS,
  probe,
  RECALL_STREAM_PASSWORD,
  recallTurn,
  STRADDLE_SCAN_WINDOWS,
  TURN_INTENT,
  verdicts,
  WHOLE_HISTORY_INTENT,
  world,
} from "./recall-world.ts";

test("mode off recalls nothing and embeds no query; the same room under mixB recalls the scene", async () => {
  await using w = await world.build({ mode: "off", maxTier: 0 });
  const off = await recallTurn(w.h, ask("bath"));
  expect(off.trace.mode).toBe("off");
  expect(off.trace.surfaced).toBe(0);
  expect(off.trace.queryEmbedded).toBe(false);
  expect(off.trace.candidates).toEqual([]);
  expect(off.prompt).not.toContain("arc-bath.");

  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "mixB" } } });
  const on = await recallTurn(w.h, ask("bath"));
  expect(on.trace.queryEmbedded).toBe(true);
  expect(admitted(on.trace)).toContain(blockOf("bath"));
  expect(on.prompt).toContain("arc-bath.");
});

test("a room with no digests embeds no query, even for a retrieval mode", async () => {
  await using h = await createChatRoot({
    providerFetch: async (input, init) =>
      await createCorpusProviderExecution({
        modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
        embedding: embeddingFor,
        structuredReplies: CORPUS_STRUCTURED_REPLIES,
        images: [],
        chatText: generatedText,
      }).execute(new Request(input, init)),
    memoryEnabled: true,
    memoryDefaults: { mode: "mixB", blockSize: BLOCK_SIZE, verbatimWindow: 0, fanOut: FAN_OUT, maxTier: 0 },
  });
  const run = await recallTurn(h, ask("bath"));
  expect(run.trace.poolSize).toBe(0);
  expect(run.trace.queryEmbedded).toBe(false);
  expect(run.trace.surfaced).toBe(0);
});

test("a retrieval mode surfaces its admitted blocks and reports the count it surfaced", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  const run = await recallTurn(w.h, ask("duel"));
  expect(admitted(run.trace)[0]).toBe(blockOf("duel"));
  expect(run.trace.surfaced).toBe(admitted(run.trace).length);
  expect(run.trace.surfaced).toBeGreaterThan(0);
});

test("minScore is a graded floor, and a query on an axis no digest holds surfaces nothing", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  const setFloor = async (minScore: number): Promise<void> => {
    await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { minScore } } });
  };
  // The query is the one line sent. Two probes, the later one heavier: the storm scene's cosine is near 0.93, the bath scene's near 0.37.
  // The keyword fold admits a digest whose keywords the query names whatever its cosine, so the floor is read with it off.
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { queryWindow: 1, keywordMatch: false } } });
  const both = `Tell me about the scene. ${probe("bath")} ${probe("storm")}`;
  await setFloor(0.05);
  const low = admitted((await recallTurn(w.h, both)).trace);
  await setFloor(0.6);
  const mid = admitted((await recallTurn(w.h, both)).trace);
  await setFloor(0.99);
  const high = admitted((await recallTurn(w.h, both)).trace);
  expect(low).toEqual([blockOf("storm"), blockOf("bath")]);
  expect(mid).toEqual([blockOf("storm")]);
  expect(high).toEqual([]);
  await setFloor(0.6);
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { keywordMatch: true } } });
  expect(admitted((await recallTurn(w.h, both)).trace)).toEqual([blockOf("storm"), blockOf("bath")]);
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { keywordMatch: false } } });

  await setFloor(0.05);
  const offCorpus = await recallTurn(w.h, ask(OFF_CORPUS));
  expect(offCorpus.trace.queryEmbedded).toBe(true);
  expect(offCorpus.trace.surfaced).toBe(0);
  expect(offCorpus.trace.candidates.length).toBeGreaterThan(0);
  expect(offCorpus.trace.candidates.every((candidate) => candidate.verdict === "below-floor")).toBe(true);
});

test("queryWindow decides which recent lines the query is made of", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { minScore: 0.05 } } });
  await recallTurn(w.h, ask("bath"));
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { queryWindow: 1 } } });
  const narrow = await recallTurn(w.h, ask("storm"));
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { queryWindow: 6 } } });
  const wide = await recallTurn(w.h, ask("storm"));
  expect(admitted(narrow.trace)).toEqual([blockOf("storm")]);
  expect(admitted(wide.trace)).toEqual(expect.arrayContaining([blockOf("storm"), blockOf("bath")]));
});

test("retrieveK cuts the ranked pool and raising it brings the second scene back", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { minScore: 0.05, queryWindow: 6 } } });
  await recallTurn(w.h, ask("bath"));
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { retrieveK: 1 } } });
  const cut = await recallTurn(w.h, ask("storm"));
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { retrieveK: 5 } } });
  const wide = await recallTurn(w.h, ask("storm"));
  expect(admitted(cut.trace)).toEqual([blockOf("storm")]);
  expect(admitted(wide.trace)).toEqual([blockOf("storm"), blockOf("bath")]);
});

test("rerankTo cuts the reranked pool in mixC to the cross-encoder's favourite", async () => {
  await using w = await world.build({ mode: "mixC", maxTier: 0 });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { minScore: 0.05, queryWindow: 6, retrieveK: 5 } } });
  await recallTurn(w.h, ask("bath"));
  w.rerankPrefers("bath");
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { rerankTo: 1 } } });
  const cut = await recallTurn(w.h, ask("storm"));
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { rerankTo: 5 } } });
  const wide = await recallTurn(w.h, ask("storm"));
  expect(admitted(cut.trace)).toEqual([blockOf("bath")]);
  expect(admitted(wide.trace)).toEqual([blockOf("bath"), blockOf("storm")]);
});

test("the live window outranks relevance: a scene still verbatim in the prompt is not recalled", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  const aged = await recallTurn(w.h, ask("bath"));
  expect(admitted(aged.trace)).toContain(blockOf("bath"));

  // The cutoff is the previous turn's fit boundary, so the turn that sends the whole history shows its effect on the next one.
  await recallTurn(w.h, ask("bath"), WHOLE_HISTORY_INTENT);
  const whole = await recallTurn(w.h, ask("bath"));
  expect(whole.trace.surfaced).toBe(0);
  expect(verdicts(whole.trace, "live-window").length).toBeGreaterThan(0);
  expect(whole.trace.candidates.some((candidate) => candidate.verdict === "admitted")).toBe(false);
});

test("a ceiling below the consolidated tier keeps those digests out; raising it admits them", async () => {
  await using w = await world.build({ mode: "tiered", maxTier: 1 });
  const withTier = await recallTurn(w.h, ask("bath"));
  expect(withTier.trace.candidates.some((candidate) => candidate.tier === 1)).toBe(true);

  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { maxTier: 0 } } });
  const flat = await recallTurn(w.h, ask("bath"));
  expect(flat.trace.candidates.length).toBeGreaterThan(0);
  expect(flat.trace.candidates.every((candidate) => candidate.tier === 0)).toBe(true);
});

test("tiered reports the tier-0 blocks a surfaced consolidation covers, and mixA reports the higher tiers it never reads", async () => {
  await using w = await world.build({ mode: "tiered", maxTier: 1 });
  const tiered = await recallTurn(w.h, ask("bath"));
  const coarse = tiered.trace.candidates.filter((candidate) => candidate.tier === 1 && candidate.verdict === "admitted");
  expect(coarse.length).toBeGreaterThan(0);
  expect(verdicts(tiered.trace, "bridge-covered").length).toBeGreaterThan(0);
  expect(verdicts(tiered.trace, "bridge-covered").every((candidate) => candidate.tier === 0)).toBe(true);
  expect(tiered.trace.queryEmbedded).toBe(false);

  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "mixA" } } });
  const mixA = await recallTurn(w.h, ask("bath"));
  expect(mixA.trace.queryEmbedded).toBe(false);
  expect(admitted(mixA.trace)).toEqual(expect.arrayContaining(ARCS.map(blockOf)));
  expect(admitted(mixA.trace)).toEqual(admitted(mixA.trace).toSorted((a, b) => a - b));
  expect(mixA.trace.candidates.filter((candidate) => candidate.verdict === "admitted").every((candidate) => candidate.tier === 0)).toBe(true);
  expect(verdicts(mixA.trace, "mode-excluded").length).toBeGreaterThan(0);
  expect(verdicts(mixA.trace, "mode-excluded").every((candidate) => candidate.tier === 1)).toBe(true);
});

test("hiding a trailing span reclaims its digest, so the room no longer holds it", async () => {
  await using w = await world.build({ mode: "mixA", maxTier: 0 });
  const { h } = w;
  /** Every digest block the room holds, read through the omnibox digest search. */
  const heldBlocks = async (): Promise<readonly number[]> => {
    const result = await h.caller.search.search({
      query: ask("bath"),
      over: "digests",
      scope: { kind: "chat", chatId: h.chatId },
      topN: 100,
      rerank: false,
    });
    return result.over === "digests" ? result.hits.map((hit) => hit.blockKey.blockIdx).toSorted((a, b) => a - b) : [];
  };
  const before = await heldBlocks();
  const messages = (await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages;
  for (const { id } of messages.slice(-2)) {
    await h.root.services.chat.setMessageHidden({ principal: h.owner, chatId: h.chatId, messageId: id, hidden: true });
  }
  await w.sweep({ kind: "memory-backfill", params: {} });
  const after = await heldBlocks();
  expect(before.length).toBeGreaterThan(0);
  expect(after).toEqual(before.slice(0, -1));
});

test("a scoped speaker recalls the shared era and its own era, never another speaker's, and a merged speaker recalls only the shared era", async () => {
  await using w = await world.build({ mode: "mixA", maxTier: 0, scout: true });
  const { h } = w;
  const [keeper, scout] = h.characters;
  if (keeper === undefined || scout === undefined) {
    throw new Error("the room seats two characters");
  }
  /** The digest buckets each recall of one turn read, by the bucket the recall was scoped to. */
  const bucketsRead = async (characterId: typeof keeper.id): Promise<ReadonlyMap<string, ReadonlySet<string>>> => {
    const before = h.root.app.recallRecorder.recent({ chatId: h.chatId }).at(-1)?.seq ?? 0;
    const turn = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId, intent: TURN_INTENT });
    expect(turn.aborted).toBe(false);
    const read = new Map<string, Set<string>>();
    for (const record of h.root.app.recallRecorder.recent({ chatId: h.chatId }).filter((candidate) => candidate.seq > before)) {
      read.set(record.scopedCharacterId, new Set(record.trace.candidates.map((candidate) => candidate.scopedCharacterId)));
    }
    return read;
  };
  const seated = new Set<string>([keeper.id, scout.id]);
  const sharedOf = (read: ReadonlyMap<string, ReadonlySet<string>>): string => {
    const shared = [...read.keys()].find((bucket) => !seated.has(bucket));
    if (shared === undefined) {
      throw new Error("no recall was scoped to the shared bucket");
    }
    return shared;
  };

  const asKeeper = await bucketsRead(keeper.id);
  const shared = sharedOf(asKeeper);
  expect(asKeeper.get(keeper.id)).toEqual(new Set([shared, keeper.id]));

  const asScout = await bucketsRead(scout.id);
  expect(asScout.get(scout.id)).toEqual(new Set([shared, scout.id]));
  expect([...asScout.values()].every((buckets) => !buckets.has(keeper.id))).toBe(true);

  await h.caller.chat.setGroupConfig({ chatId: h.chatId, config: { output: "per-speaker", policy: "list", cardScope: "merged" } });
  const merged = await bucketsRead(keeper.id);
  expect([...merged.keys()]).toEqual([shared]);
  expect(merged.get(shared)).toEqual(new Set([shared]));
});

const recallPhaseFrameSchema = z.object({
  event: z.object({ type: z.literal("memoryRecall"), phase: z.string(), count: z.number().nullable() }),
});

/** The owner's multiplexed event stream attached live to the room, read as the browser reads it. */
async function openRoomStream(
  h: ChatRoot,
): Promise<{ readonly readThrough: (needle: string, occurrences?: number) => Promise<string>; readonly close: () => Promise<void> }> {
  const session = await captureCookieAuth(h.root, await h.root.principalFor(h.root.ownerId), RECALL_STREAM_PASSWORD);
  const { socketId } = streamConnectInputSchema.parse({ socketId: h.root.ids.uuid() });
  const address = new URL("http://localhost/api/trpc/stream.connect");
  address.searchParams.set("input", JSON.stringify({ socketId }));
  const stop = new AbortController();
  const response = await h.root.http.request(address, { headers: { cookie: session.cookie, accept: "text/event-stream" }, signal: stop.signal });
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new Error("the room stream omitted its body");
  }
  const decoder = new TextDecoder();
  let bytes = "";
  const readThrough = async (needle: string, occurrences = 1): Promise<string> => {
    while (bytes.split(needle).length - 1 < occurrences) {
      const next = await reader.read();
      if (next.done) {
        throw new Error("the room stream ended before its delivery barrier");
      }
      bytes += decoder.decode(next.value, { stream: true });
    }
    return bytes;
  };
  await readThrough("serverReady");
  await h.caller.stream.attach({ socketId, ref: { channel: "chat", chatId: h.chatId } });
  await readThrough('"type":"attached"');
  return {
    readThrough,
    close: async (): Promise<void> => {
      stop.abort();
      await reader.cancel().catch(() => undefined);
    },
  };
}

test("recall announces its phases on the room stream only when memory is on, and the closing count is the surfaced count", async () => {
  await using w = await world.build({ mode: "off", maxTier: 0, signIn: true });
  const { h } = w;
  const stream = await openRoomStream(h);
  try {
    const off = await recallTurn(h, ask("bath"));
    expect(off.trace.mode).toBe("off");
    await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "mixB" } } });
    const on = await recallTurn(h, ask("bath"));
    expect(on.trace.surfaced).toBeGreaterThan(0);
    const wire = await stream.readThrough('"type":"turnCompleted"', 2);
    const phases = wire
      .split("\n")
      .filter((line) => line.includes('"type":"memoryRecall"'))
      .map((line) => recallPhaseFrameSchema.parse(JSON.parse(line.slice("data: ".length))).event);
    expect(phases).toEqual([
      { type: "memoryRecall", phase: "recalling", count: null },
      { type: "memoryRecall", phase: "recalled", count: on.trace.surfaced },
    ]);
  } finally {
    await stream.close();
  }
});

/** The canon position the next recall's live window starts at: where the newest reply's stored fit boundary sits. */
async function cutoffPosition(h: ChatRoot): Promise<number> {
  const canon = await readRoomCanon(h.root, h.owner, h.chatId);
  const boundary = canon.findLast((message) => message.role === "assistant")?.contextBoundaryMessageId;
  return canon.findIndex((message) => message.id === boundary);
}

test("a cutoff inside a tier-1 digest drops it, and a cutoff inside a tier-0 block keeps that block", async () => {
  await using w = await world.build({ mode: "tiered", maxTier: 1 });
  // The cutoff is a token fit boundary, so the window is walked down until a turn's boundary lands inside a block.
  for (const window of STRADDLE_SCAN_WINDOWS) {
    const cut = await cutoffPosition(w.h);
    const run = await recallTurn(w.h, ask("bath"), { maxContextTokens: window, maxOutputTokens: 64 });
    const inTier0 = Math.floor(cut / BLOCK_SIZE);
    const inTier1 = Math.floor(inTier0 / FAN_OUT);
    const tier0 = run.trace.candidates.find((candidate) => candidate.tier === 0 && candidate.blockIdx === inTier0);
    const tier1 = run.trace.candidates.find((candidate) => candidate.tier === 1 && candidate.blockIdx === inTier1);
    if (cut % BLOCK_SIZE === 0 || tier0 === undefined || tier1 === undefined) {
      continue;
    }
    expect(tier1.verdict).toBe("live-window");
    expect(tier0.verdict).toBe("admitted");
    return;
  }
  throw new Error("no turn's fit boundary fell inside a block");
});
