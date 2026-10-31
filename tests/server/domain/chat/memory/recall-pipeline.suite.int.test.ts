// The recall pipeline through the composed root: the mode switch, the pool stages, the verdict ledger and the knobs.
// Digests come from the production memory build over a transcript; only the provider embedding edge is scripted, so a
// scan runs the real cosine. Each turn's trace is read from the recall recorder the root composes.
// @subject packages/server/src/domain/chat/memory/recall/recall.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { MemoryRecallCandidate, MemoryRecallSlice, MemoryRecallVerdict } from "@orb/contracts/chat";
import { resolveProseText } from "@orb/contracts/prose";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  SUMMARIZE_TRANSCRIPT_MARKER,
  summaryReply,
} from "@orb/testkit/node/composed";
import { z } from "zod";

const RERANK_MODEL = "corpus-rerank";
const RERANK_WINDOW_TOKENS = 2048;
const TURN_INTENT = { maxContextTokens: 4096, maxOutputTokens: 64 } as const;
/** A window no history can fill: the whole transcript stays verbatim in the prompt. */
const WHOLE_HISTORY_INTENT = { maxContextTokens: 400_000, maxOutputTokens: 64 } as const;
/** One scene per arc. A scene is two transcript lines, so with `blockSize` 2 each arc is one tier-0 block. */
const ARCS = ["bath", "market", "duel", "shrine", "storm", "farewell"] as const;
type Arc = (typeof ARCS)[number];
const OFF_CORPUS = "elsewhere";
const FILLER_LINES = 10;
const FILLER = "The caravan creaked on through the grey morning while the drivers argued about the weather and the oxen. ".repeat(18);
const VECTOR_WIDTH = CORPUS_EMBEDDING_VECTOR.length;
const EARLIER_PROBE_WEIGHT = 0.4;
const FILLER_AXIS = ARCS.length + 1;
const OFF_CORPUS_AXIS = ARCS.length;

function probe(arc: Arc | typeof OFF_CORPUS): string {
  return `probe-${arc}.`;
}

function axisOf(name: string): number {
  const arc = ARCS.find((candidate) => candidate === name);
  return arc === undefined ? OFF_CORPUS_AXIS : ARCS.indexOf(arc);
}

function unit(axis: number, weight = 1): number[] {
  return Array.from({ length: VECTOR_WIDTH }, (_, index) => (index === axis ? weight : 0));
}

/** A probe in the text puts the vector on that arc's axis, later probes heavier; a digest names its own arc. */
function embeddingFor(input: string): number[] {
  const probes = [...input.matchAll(/probe-([a-z]+)\./g)].map((match) => match[1] ?? OFF_CORPUS);
  if (probes.length > 0) {
    const sum = unit(FILLER_AXIS, 0);
    probes.forEach((name, index) => {
      sum[axisOf(name)] = (sum[axisOf(name)] ?? 0) + (index === probes.length - 1 ? 1 : EARLIER_PROBE_WEIGHT);
    });
    return sum;
  }
  const arc = ARCS.find((candidate) => input.includes(`-${candidate}.`));
  return unit(arc === undefined ? FILLER_AXIS : ARCS.indexOf(arc));
}

function lineText(arc: Arc): string {
  return `line-${arc}. They went on about the ${arc}.`;
}

function digestText(arc: Arc): string {
  return summaryReply({ anchor: `Arc ${arc}`, facts: `arc-${arc}. The ${arc} scene happened here.`, keywords: [arc] });
}

const rerankBodySchema = z.object({ model: z.literal(RERANK_MODEL), documents: z.array(z.string()) });

interface RecallWorld extends AsyncDisposable {
  readonly h: ChatRoot;
  /** The arc the scripted cross-encoder scores highest. */
  readonly rerankPrefers: (arc: Arc) => void;
  /** Run one production sweep to completion, as the sweeps that built this room did. */
  readonly sweep: (input: WorkloadInput) => Promise<void>;
}

type WorkloadInput = Parameters<ChatRoot["caller"]["workloads"]["start"]>[0]["input"];

interface World {
  readonly build: (config: {
    readonly mode: "off" | "mixA" | "mixB" | "mixC" | "tiered";
    readonly maxTier: number;
    readonly scout?: boolean;
  }) => Promise<RecallWorld>;
}

// The consolidation prompt leads with this slot; its default text is the one production sends when the host sets no override.
const CONSOLIDATION_LEAD = resolveProseText("chat.memory.consolidationLead", {});

function generatedText(body: string): string {
  if (body.includes(CONSOLIDATION_LEAD)) {
    return summaryReply({ anchor: "Merged arc", facts: "The scenes merged into one arc.", keywords: ["merged"] });
  }
  if (!body.includes(SUMMARIZE_TRANSCRIPT_MARKER)) {
    return "The keeper answers.";
  }
  const arc = ARCS.find((candidate) => body.includes(`line-${candidate}.`));
  return arc === undefined ? summaryReply({ anchor: "Filler", facts: "The caravan rested.", keywords: ["rest"] }) : digestText(arc);
}

const world: World = {
  async build(config): Promise<RecallWorld> {
    let preferred: Arc = ARCS[0];
    const physical = createCorpusProviderExecution({
      modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL, RERANK_MODEL],
      embedding: embeddingFor,
      structuredReplies: CORPUS_STRUCTURED_REPLIES,
      images: [],
      chatText: generatedText,
    });
    await using construction = new AsyncDisposableStack();
    const h = construction.use(
      await createChatRoot({
        providerFetch: async (input, init) => {
          const request = new Request(input, init);
          if (new URL(request.url).pathname !== "/v1/rerank") {
            return await physical.execute(request);
          }
          const body = rerankBodySchema.parse(await request.json());
          const results = body.documents.map((document, index) => ({ index, ["relevance_score"]: document.includes(`arc-${preferred}.`) ? 1 : 0 }));
          return Response.json({ results });
        },
        memoryEnabled: true,
        memoryDefaults: { mode: "mixB", blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: config.maxTier },
        characters: [
          createCharacterSchema.parse({ handle: "keeper", name: "Keeper", description: "The keeper of the caravan ledger." }),
          ...(config.scout === true ? [createCharacterSchema.parse({ handle: "scout", name: "Scout", description: "The scout who rides ahead." })] : []),
        ],
        ...(config.scout === true ? { group: { output: "per-speaker" as const, policy: "list" as const, cardScope: "scoped" as const } } : {}),
        transcript: [
          ...ARCS.flatMap((arc) => [0, 1].map(() => ({ role: "assistant" as const, content: `${lineText(arc)} ${FILLER}` }))),
          ...Array.from({ length: FILLER_LINES }, (_, index) => ({ role: "assistant" as const, content: `Filler ${index}: ${FILLER}` })),
        ],
      }),
    );
    const connection = await h.root.services.connection.create({
      principal: h.owner,
      providerId: "custom-openai",
      credentialId: null,
      baseUrl: CORPUS_PROVIDER_ENDPOINT,
      model: RERANK_MODEL,
      label: "Corpus reranker",
      allowBackground: true,
      declared: {
        kind: "rerank",
        rerank: { maxInputTokens: RERANK_WINDOW_TOKENS, input: ["text"], instructionAware: false },
        features: { detectServer: false, rerankPath: "/rerank" },
      },
    });
    await h.caller.connection.setBinding({ task: "rerank", connectionId: connection.id });
    const keeper = h.characters[0];
    if (keeper === undefined) {
      throw new Error("the recall world has no speaker");
    }
    // The warm-up turn builds the room's digests through the live memory pass; the sweeps put them in the active space.
    const built = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: keeper.id, intent: TURN_INTENT });
    if (built.aborted) {
      throw new Error("the memory warm-up turn aborted");
    }
    await h.root.settleBackground();
    const lifetime = new AbortController();
    construction.defer(() => lifetime.abort());
    const runAdmittedWorkload = h.root.runAdmittedWorkload;
    if (runAdmittedWorkload === undefined) {
      throw new Error("the recall world has no admitted-workload driver");
    }
    const sweep = async (input: WorkloadInput): Promise<void> => {
      const job = await h.caller.workloads.start({ input, mode: "singular" });
      await runAdmittedWorkload(job.id, lifetime.signal);
    };
    for (const input of [
      { kind: "index", params: { source: "text" } },
      { kind: "memory-backfill", params: {} },
      { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } },
    ] as const satisfies WorkloadInput[]) {
      await sweep(input);
    }
    // The build runs under mixB: a room with memory off has nothing to back fill. The case's own mode applies after it.
    await h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: config.mode } } });
    const kept = construction.move();
    return {
      h,
      rerankPrefers: (arc): void => {
        preferred = arc;
      },
      sweep,
      [Symbol.asyncDispose]: () => kept.disposeAsync(),
    };
  },
};

interface RecallRun {
  readonly trace: MemoryRecallSlice;
  readonly prompt: string;
}

/** Send one user line and read the single recall the turn recorded, with the prompt the chat model received. */
async function recallTurn(h: ChatRoot, content: string, intent: typeof TURN_INTENT | typeof WHOLE_HISTORY_INTENT = TURN_INTENT): Promise<RecallRun> {
  const before = h.root.app.recallRecorder.recent({ chatId: h.chatId }).at(-1)?.seq ?? 0;
  const requestsBefore = h.requests.length;
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content, intent });
  expect(outcome.aborted).toBe(false);
  const recalls = h.root.app.recallRecorder.recent({ chatId: h.chatId }).filter((record) => record.seq > before);
  expect(recalls).toHaveLength(1);
  const trace = recalls[0]?.trace;
  if (trace === undefined) {
    throw new Error("the turn recorded no recall");
  }
  const bodies = await Promise.all(
    h.requests
      .slice(requestsBefore)
      .filter((request) => request.method === "POST" && new URL(request.url).pathname === "/v1/chat/completions")
      .map((request) => request.clone().text()),
  );
  return { trace, prompt: bodies.filter((body) => !body.includes(SUMMARIZE_TRANSCRIPT_MARKER)).at(-1) ?? "" };
}

function admitted(trace: MemoryRecallSlice): readonly number[] {
  return trace.candidates.filter((candidate) => candidate.verdict === "admitted").map((candidate) => candidate.blockIdx);
}

function verdicts(trace: MemoryRecallSlice, verdict: MemoryRecallVerdict): readonly MemoryRecallCandidate[] {
  return trace.candidates.filter((candidate) => candidate.verdict === verdict);
}

/** The block index an arc's digest sits at: the transcript lists the arcs in order, two lines each. */
function blockOf(arc: Arc): number {
  return ARCS.indexOf(arc);
}

const ask = (arc: Arc | typeof OFF_CORPUS): string => `Tell me about the scene. ${probe(arc)}`;

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
    memoryDefaults: { mode: "mixB", blockSize: 2, verbatimWindow: 0, fanOut: 2, maxTier: 0 },
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
  expect(run.trace.candidates.find((candidate) => candidate.verdict === "admitted")?.score).toBeDefined();
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
