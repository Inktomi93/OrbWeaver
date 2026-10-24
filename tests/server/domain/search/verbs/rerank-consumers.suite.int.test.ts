// Every consumer that reranks follows the bound cross-encoder over production-built rows. Scripted vectors put the
// wanted item last in vector order, so a first place is the reranker's work; the rerank wire is answered physically.
// @subject packages/server/src/domain/search/substrate/rerank.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { RERANK_MIN_WINDOW_TOKENS } from "@orb/contracts/inference";
import type { CharacterId, DocumentId } from "@orb/kit/ids";
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
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { z } from "zod";

const RERANK_MODEL = "corpus-rerank";
const WIDE_WINDOW_TOKENS = 2048;
/** Too small to reach a closing that sits hundreds of tokens into an item. */
const NARROW_WINDOW_TOKENS = 512;
const TURN_INTENT = { maxContextTokens: 4096, maxOutputTokens: 64 } as const;
/** The one fact the query asks about. The scripted cross-encoder scores a document by whether this reached the wire. */
const NEEDLE = "the copper key under the third milestone";
const QUERY = "Where did we hide the key on the road north?";
const WANTED = "crossing";
const ARCS = ["market", "storm", "shrine", WANTED] as const;
type Arc = (typeof ARCS)[number];
const PERSONA_NAMES: Readonly<Record<Arc, string>> = { market: "Mira", storm: "Niko", shrine: "Rowan", crossing: "Maelis" };
/** Ordinary campaign texture shared by every item, so it cannot tell them apart. */
const TEXTURE = "The caravan creaked on through the grey morning while the drivers argued about the weather and the oxen. ".repeat(18);
const VECTOR_WIDTH = CORPUS_EMBEDDING_VECTOR.length;
const WANTED_LEAN = 0.9;
const LEAN_STEP = 0.08;
/** Recent lines that fill the turn's verbatim window, so every arc block has aged into recall. */
const FILLER_LINES = 10;
const OMNIBOX_TOP_N = 20;
const SHAPES = ["text", "needle"] as const;
/** `text`: the subject leads the item. `needle`: only the late closing, hundreds of tokens in, holds the fact. */
type Shape = (typeof SHAPES)[number];

/** Each item tags its text with its kind and arc, so the scripted encoder can place it. */
const ITEM_KINDS = ["line", "arc", "persona", "doc"] as const;
type ItemKind = (typeof ITEM_KINDS)[number];

function tagOf(kind: ItemKind, arc: Arc): string {
  return `${kind}-${arc}.`;
}

function itemText(shape: Shape, kind: ItemKind, arc: Arc): string {
  const fact = arc === WANTED ? `They buried ${NEEDLE}.` : `They spoke of the ${arc} and nothing hidden.`;
  return shape === "text" ? `${tagOf(kind, arc)} ${fact} ${TEXTURE}` : `${tagOf(kind, arc)} ${TEXTURE}${fact}`;
}

/** A vector leaning off the query axis: the larger the lean, the lower its cosine to the query. */
function leaning(lean: number): number[] {
  return Array.from({ length: VECTOR_WIDTH }, (_, index) => {
    if (index === 0) {
      return 1;
    }
    return index === 1 ? lean : 0;
  });
}

function embeddingFor(input: string): number[] {
  const arc = ARCS.find((candidate) => input.includes(`-${candidate}.`));
  if (arc === undefined) {
    return leaning(0);
  }
  return leaning(arc === WANTED ? WANTED_LEAN : ARCS.indexOf(arc) * LEAN_STEP);
}

const rerankBodySchema = z.object({ model: z.literal(RERANK_MODEL), query: z.string(), documents: z.array(z.string()) });
type RerankCall = z.infer<typeof rerankBodySchema>;

/** How the physical cross-encoder answers: score every document, name only the ones holding the fact, or fail. */
const RERANK_REPLIES = ["score", "fact-only", "fail"] as const;
type RerankReplyMode = (typeof RERANK_REPLIES)[number];
const ENGINE_FAILURE_STATUS = 500;

/** A document scores by whether the fact reached it, so a clamped closing scores nothing. */
function rerankReply(body: string, calls: RerankCall[], mode: RerankReplyMode): Response {
  const parsed = rerankBodySchema.parse(JSON.parse(body));
  calls.push(parsed);
  if (mode === "fail") {
    return Response.json({ error: { message: "Controlled rerank engine failure" } }, { status: ENGINE_FAILURE_STATUS });
  }
  const scored = parsed.documents.map((document, index) => ({ index, ["relevance_score"]: document.includes(NEEDLE) ? 1 : 0 }));
  return Response.json({ results: mode === "score" ? scored : scored.filter((result) => result["relevance_score"] > 0) });
}

interface RerankWorld extends AsyncDisposable {
  readonly h: ChatRoot;
  readonly rerankCalls: readonly RerankCall[];
  /** The persona cards by arc, outside the memory room. */
  readonly personas: Readonly<Record<Arc, CharacterId>>;
  /** An owned document attached only to another room; it carries the fact too. */
  readonly elsewhere: DocumentId;
  /** A second account's document carrying the fact. */
  readonly foreign: DocumentId;
  readonly bindRerank: (maxInputTokens: number) => Promise<void>;
  readonly answerRerank: (mode: RerankReplyMode) => void;
  /** The second account's own caller, for the control that its document is retrievable at all. */
  readonly strangerCaller: ChatRoot["caller"];
}

function generatedText(shape: Shape, body: string): string {
  if (!body.includes("Transcript block:")) {
    return "The keeper answers.";
  }
  const arc = ARCS.find((candidate) => body.includes(tagOf("line", candidate)));
  return arc === undefined ? "Filler\nThe caravan rested.\nKeywords: rest" : `Arc ${arc}\n${itemText(shape, "arc", arc)}\nKeywords: ${arc}`;
}

type WorkloadInput = Parameters<ChatRoot["caller"]["workloads"]["start"]>[0]["input"];
const OWNER_SWEEPS = [
  { kind: "index", params: { source: "text" } },
  { kind: "memory-backfill", params: {} },
  { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } },
] as const satisfies WorkloadInput[];

/** Run one account's sweeps to completion, so its rows sit in an active vector space. */
async function runWorkloads(h: ChatRoot, caller: ChatRoot["caller"], inputs: readonly WorkloadInput[], lifetime: AbortSignal): Promise<void> {
  const runAdmittedWorkload = h.root.runAdmittedWorkload;
  if (runAdmittedWorkload === undefined) {
    throw new Error("the rerank world has no admitted-workload driver");
  }
  for (const input of inputs) {
    const job = await caller.workloads.start({ input, mode: "singular" });
    await runAdmittedWorkload(job.id, lifetime);
    const completed = await caller.workloads.get({ id: job.id });
    if (completed.status !== "succeeded") {
      throw new Error(`the rerank world workload did not succeed: ${completed.kind} ${completed.status}`);
    }
  }
}

/** One owner, one memory room, persona cards, a databank and a stranger's document, all through production writes. */
async function rerankWorld(shape: Shape): Promise<RerankWorld> {
  const rerankCalls: RerankCall[] = [];
  let replyMode: RerankReplyMode = "score";
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL, RERANK_MODEL],
    embedding: embeddingFor,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    chatText: (body) => generatedText(shape, body),
  });
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await createChatRoot({
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        return new URL(request.url).pathname === "/v1/rerank" ? rerankReply(await request.text(), rerankCalls, replyMode) : await physical.execute(request);
      },
      memoryEnabled: true,
      memoryDefaults: { mode: "mixC", blockSize: 2, verbatimWindow: 0, maxTier: 0 },
      characters: [createCharacterSchema.parse({ handle: "keeper", name: "Keeper", description: "The keeper of the caravan ledger." })],
      transcript: [
        ...ARCS.flatMap((arc) => [0, 1].map(() => ({ role: "assistant" as const, content: itemText(shape, "line", arc) }))),
        ...Array.from({ length: FILLER_LINES }, (_, index) => ({ role: "assistant" as const, content: `Filler ${index}: ${TEXTURE}` })),
      ],
    }),
  );
  const bindRerank = async (maxInputTokens: number): Promise<void> => {
    const connection = await h.root.services.connection.create({
      principal: h.owner,
      providerId: "custom-openai",
      credentialId: null,
      baseUrl: CORPUS_PROVIDER_ENDPOINT,
      model: RERANK_MODEL,
      label: `Corpus reranker ${maxInputTokens}`,
      allowBackground: true,
      declared: {
        kind: "rerank",
        rerank: { maxInputTokens, input: ["text"], instructionAware: false },
        features: { detectServer: false, rerankPath: "/rerank" },
      },
    });
    await h.caller.connection.setBinding({ task: "rerank", connectionId: connection.id });
  };
  await bindRerank(WIDE_WINDOW_TOKENS);
  const personas = {} as Record<Arc, CharacterId>;
  for (const arc of ARCS) {
    const card = await h.caller.character.create({
      input: createCharacterSchema.parse({ handle: `persona-${arc}`, name: PERSONA_NAMES[arc], description: itemText(shape, "persona", arc) }),
    });
    personas[arc] = card.id;
  }
  // One chunk per document, so a k cut keeps or drops a whole item.
  await h.caller.settings.updateUserSettingsSection({ section: "databank", patch: { chunk: { chunkSize: 4000 } } });
  for (const arc of ARCS) {
    const created = await h.caller.databank.createFromText({ name: `${arc}.txt`, text: itemText(shape, "doc", arc) });
    await h.caller.databank.attachToChat({ chatId: h.chatId, documentId: created.document.id });
  }
  const keeper = h.characters[0];
  if (keeper === undefined) {
    throw new Error("the rerank world has no speaker");
  }
  const otherRoom = await h.caller.chat.startChat({ characterIds: [keeper.id], opening: "none" });
  const elsewhere = await h.caller.databank.createFromText({ name: "elsewhere.txt", text: `doc-elsewhere. They buried ${NEEDLE}.` });
  await h.caller.databank.attachToChat({ chatId: otherRoom.chat.id, documentId: elsewhere.document.id });
  const stranger = await h.root.principalFor((await h.root.actor()).id);
  await seedCorpusConnections(h.root, stranger);
  const foreign = await h.root.services.databank.createFromText({ principal: stranger, name: "foreign.txt", text: `doc-foreign. They buried ${NEEDLE}.` });
  // The warm-up turn builds the room's digests through the live memory pass.
  const built = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: keeper.id, intent: TURN_INTENT });
  if (built.aborted) {
    throw new Error("the memory warm-up turn aborted");
  }
  await h.root.settleBackground();
  const workloads = new AbortController();
  construction.defer(() => workloads.abort());
  await runWorkloads(h, h.caller, OWNER_SWEEPS, workloads.signal);
  // The stranger's full sweep activates its own space on the same encoder, so its chunk is retrievable to it.
  const strangerCaller = await h.root.internalCallerFor(stranger.userId);
  await strangerCaller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  await runWorkloads(h, strangerCaller, OWNER_SWEEPS, workloads.signal);
  const lifetime = construction.move();
  return {
    h,
    rerankCalls,
    personas,
    elsewhere: elsewhere.document.id,
    foreign: foreign.document.id,
    bindRerank,
    answerRerank: (mode): void => {
      replyMode = mode;
    },
    strangerCaller,
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

/** The foreground prompts the room's chat model actually received, newest last. */
async function chatPrompts(h: ChatRoot): Promise<string[]> {
  const bodies = await Promise.all(
    h.requests
      .filter((request) => request.method === "POST" && new URL(request.url).pathname === "/v1/chat/completions")
      .map((request) => request.clone().text()),
  );
  return bodies.filter((body) => !body.includes("Transcript block:"));
}

/** The block index production stored an arc's digest under, read back through the omnibox. */
async function arcBlockIdx(h: ChatRoot, arc: Arc): Promise<number> {
  const result = await h.caller.search.search({ query: QUERY, over: "digests", scope: { kind: "chat", chatId: h.chatId }, topN: OMNIBOX_TOP_N, rerank: false });
  const hit = result.over === "digests" ? result.hits.find((candidate) => candidate.text.includes(tagOf("arc", arc))) : undefined;
  if (hit === undefined) {
    throw new Error(`production stored no digest for the ${arc} arc`);
  }
  return hit.blockKey.blockIdx;
}

async function recallTurn(world: RerankWorld): Promise<{ readonly admitted: readonly number[]; readonly rerankCalls: number; readonly prompt: string }> {
  const { h } = world;
  const before = h.root.app.recallRecorder.recent({ chatId: h.chatId }).at(-1)?.seq ?? 0;
  const callsBefore = world.rerankCalls.length;
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: QUERY, intent: TURN_INTENT });
  expect(outcome.aborted).toBe(false);
  const recalls = h.root.app.recallRecorder.recent({ chatId: h.chatId }).filter((record) => record.seq > before);
  expect(recalls).toHaveLength(1);
  const admitted = (recalls[0]?.trace.candidates ?? []).filter((candidate) => candidate.verdict === "admitted").map((candidate) => candidate.blockIdx);
  return { admitted, rerankCalls: world.rerankCalls.length - callsBefore, prompt: (await chatPrompts(h)).at(-1) ?? "" };
}

test.for(SHAPES)("memory recall reranks its digest arcs in mixC and keeps vector order in mixB (%s)", async (shape) => {
  await using world = await rerankWorld(shape);
  const wanted = await arcBlockIdx(world.h, WANTED);
  const earliest = await arcBlockIdx(world.h, ARCS[0]);
  const reranked = await recallTurn(world);
  expect(reranked.rerankCalls).toBe(1);
  expect(reranked.admitted[0]).toBe(wanted);
  expect(reranked.prompt).toContain(NEEDLE);
  // Rank decides what is recalled; the prompt still reads the recalled arcs oldest first.
  expect(earliest).toBeLessThan(wanted);
  expect(reranked.admitted.indexOf(earliest)).toBeGreaterThan(reranked.admitted.indexOf(wanted));
  expect(reranked.prompt.indexOf(tagOf("arc", ARCS[0]))).toBeGreaterThan(-1);
  expect(reranked.prompt.indexOf(tagOf("arc", ARCS[0]))).toBeLessThan(reranked.prompt.indexOf(tagOf("arc", WANTED)));

  await world.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "mixB", blockSize: 2, verbatimWindow: 0, maxTier: 0 } } });
  const vectorOrder = await recallTurn(world);
  expect(vectorOrder.rerankCalls).toBe(0);
  expect(vectorOrder.admitted.length).toBeGreaterThan(1);
  expect(vectorOrder.admitted[0]).not.toBe(wanted);
});

test.for(SHAPES)("the databank gather keeps the reranked chunk inside its k cut, from this room's bank only (%s)", async (shape) => {
  await using world = await rerankWorld(shape);
  const { h } = world;
  await h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "off" } } });
  for (const rerank of [true, false]) {
    await h.caller.settings.updateUserSettingsSection({ section: "databank", patch: { retrieval: { k: 1, minScore: 0, rerank } } });
    const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: QUERY, intent: TURN_INTENT });
    expect(outcome.aborted).toBe(false);
    const prompt = (await chatPrompts(h)).at(-1) ?? "";
    const kept = ARCS.filter((arc) => prompt.includes(tagOf("doc", arc)));
    expect(kept).toEqual(rerank ? [WANTED] : [ARCS[0]]);
    expect(prompt).not.toContain("doc-elsewhere.");
    expect(prompt).not.toContain("doc-foreign.");
  }
});

const OMNIBOX_TARGETS = ["digests", "segments", "corpus", "discover", "entities", "characters", "documents"] as const;
type OmniboxTarget = (typeof OMNIBOX_TARGETS)[number];
type SearchResult = Awaited<ReturnType<ChatRoot["caller"]["search"]["search"]>>;
type Placed = Arc | "other" | "elsewhere" | "foreign";

function arcOf(text: string): Placed {
  return ARCS.find((arc) => text.includes(`-${arc}.`)) ?? "other";
}

/** Where each hit of one result came from, in the result's own order. */
function placements(world: RerankWorld, result: SearchResult): readonly Placed[] {
  const byCharacter = new Map<CharacterId, Placed>(ARCS.map((arc) => [world.personas[arc], arc]));
  switch (result.over) {
    case "digests":
    case "segments":
    case "corpus":
      return result.hits.map((hit) => arcOf(hit.text));
    case "discover":
      return result.hits.flatMap((hit) => hit.segments.map((segment) => arcOf(segment.snippet)));
    case "entities":
    case "characters":
      return result.hits.map((hit) => byCharacter.get(hit.characterId) ?? "other");
    case "documents":
      return result.hits.map((hit) => {
        if (hit.documentId === world.foreign) {
          return "foreign";
        }
        return hit.documentId === world.elsewhere ? "elsewhere" : arcOf(hit.content);
      });
    case "images":
      return [];
  }
}

async function omniboxOrder(world: RerankWorld, over: OmniboxTarget, rerank: boolean): Promise<readonly Placed[]> {
  const { h } = world;
  const scope = over === "segments" ? { kind: "chat" as const, chatId: h.chatId, scopedCharacterId: h.characters[0]?.id } : { kind: "owner" as const };
  return placements(world, await h.caller.search.search({ query: QUERY, topN: OMNIBOX_TOP_N, rerank, over, scope }));
}

test.for(SHAPES)("every omnibox target puts the reranked item first only when its rerank switch is on (%s)", async (shape) => {
  await using world = await rerankWorld(shape);
  for (const over of OMNIBOX_TARGETS) {
    // The owned document from another room carries the fact as well; the owner scope legitimately reaches it.
    const reranked = (await omniboxOrder(world, over, true)).filter((placed) => placed !== "elsewhere");
    const vector = await omniboxOrder(world, over, false);
    expect([over, reranked[0]]).toEqual([over, WANTED]);
    expect([over, vector[0]]).not.toEqual([over, WANTED]);
    expect([...reranked, ...vector]).not.toContain("foreign");
  }
});

// Smart reads a card's leading sentences, never the whole card (`engine/character-line`), so only the text shape applies.
test("Smart gives the turn to the character whose persona leads with the fact", async () => {
  await using world = await rerankWorld("text");
  const { h } = world;
  const cast = ARCS.map((arc) => world.personas[arc]);
  const room = await h.caller.chat.startChat({ characterIds: cast, opening: "none" });
  await h.caller.chat.setGroupConfig({ chatId: room.chat.id, config: { output: "per-speaker", policy: "smart", allowSelfResponses: true } });
  const callsBefore = world.rerankCalls.length;
  const outcome = await h.root.services.chat.send({ principal: h.owner, chatId: room.chat.id, content: QUERY, intent: TURN_INTENT });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.filter((message) => message.role === "assistant").map((message) => message.characterId)).toEqual([world.personas[WANTED]]);
  expect(world.rerankCalls.slice(callsBefore).some((call) => call.documents.some((document) => document.includes(NEEDLE)))).toBe(true);
});

test("a late closing reaches the reranker inside a wide window and is clamped away by a narrow one", async () => {
  await using world = await rerankWorld("needle");
  const wantedDocument = async (): Promise<string | undefined> => {
    const before = world.rerankCalls.length;
    await omniboxOrder(world, "documents", true);
    return world.rerankCalls
      .slice(before)
      .at(-1)
      ?.documents.find((document) => document.includes(tagOf("doc", WANTED)));
  };
  const firstOwned = async (): Promise<Placed | undefined> => (await omniboxOrder(world, "documents", true)).find((placed) => placed !== "elsewhere");
  const wide = await wantedDocument();
  expect(wide).toContain(NEEDLE);
  expect(await firstOwned()).toBe(WANTED);

  await world.bindRerank(NARROW_WINDOW_TOKENS);
  const narrow = await wantedDocument();
  expect(narrow).toBeDefined();
  expect(narrow).not.toContain(NEEDLE);
  expect(wide?.startsWith(narrow ?? "")).toBe(true);
  expect(await firstOwned()).not.toBe(WANTED);
});

test.for(SHAPES)("the stranger's own search reaches its document, which the owner's reads never do (%s)", async (shape) => {
  await using world = await rerankWorld(shape);
  const own = await world.strangerCaller.search.search({ query: QUERY, topN: OMNIBOX_TOP_N, rerank: false, over: "documents", scope: { kind: "owner" } });
  expect(placements(world, own)).toEqual(["foreign"]);
  expect(await omniboxOrder(world, "documents", false)).not.toContain("foreign");
});

test("a failed rerank call fails the omnibox search instead of falling back to vector order", async () => {
  await using world = await rerankWorld("text");
  world.answerRerank("fail");
  const before = world.rerankCalls.length;
  await expect(omniboxOrder(world, "documents", true)).rejects.toThrow();
  expect(world.rerankCalls.length).toBe(before + 1);
  expect(await omniboxOrder(world, "documents", false)).toContain(WANTED);
});

test("documents the reranker leaves unscored follow the scored ones in their vector order", async () => {
  await using world = await rerankWorld("text");
  const vector = await omniboxOrder(world, "documents", false);
  world.answerRerank("fact-only");
  const reranked = await omniboxOrder(world, "documents", true);
  const holdsFact = (placed: Placed): boolean => placed === WANTED || placed === "elsewhere";
  expect(reranked.slice(0, 2).every(holdsFact)).toBe(true);
  expect(reranked.slice(2)).toEqual(vector.filter((placed) => !holdsFact(placed)));
  expect(reranked.slice(2).length).toBeGreaterThan(1);
});

test("a reranker window too small to hold any query is refused before anything is sent", async () => {
  await using world = await rerankWorld("text");
  await world.bindRerank(RERANK_MIN_WINDOW_TOKENS);
  const before = world.rerankCalls.length;
  await expect(omniboxOrder(world, "documents", true)).rejects.toThrow();
  expect(world.rerankCalls.length).toBe(before);
  await world.bindRerank(WIDE_WINDOW_TOKENS);
  expect((await omniboxOrder(world, "documents", true)).find((placed) => placed !== "elsewhere")).toBe(WANTED);
  expect(world.rerankCalls.length).toBeGreaterThan(before);
});
