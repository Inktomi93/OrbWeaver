// Native routed retrieval captures retain canonical sources; ranking policy and encoder geometry stay production-owned.
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_MEMORY_DEFAULTS } from "@orb/contracts/settings";
import { characterEmbeddings, characters, chatDigests, chatSegments, documentChunks, embeddingCalls, embedGenerations, messages } from "@orb/db";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { eq } from "drizzle-orm";
import type { CorpusRead } from "../iso/corpus.ts";
import type { CorpusSearchLibrary } from "../iso/corpus-search.ts";
import { corpusSearchInput, corpusSearchRoomIds } from "../iso/corpus-search.ts";
import type { seedCorpusKnowledgeImages } from "./corpus-knowledge-images.ts";
import type { SeededCorpusLibraries, SeededRecallCorpus, seedCorpusActors } from "./corpus-seed.ts";
import { seedCorpusConnections, seedRecallRoom } from "./corpus-seed.ts";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import { captureChatMemoryRows, seedEmbeddingGeneration } from "./factories/embedding-generation.ts";
import type { TrpcInput, TrpcProcedurePath, TrpcWireOutput } from "./route-trpc.ts";
import type { ServerTestHarness } from "./server.ts";

export const CORPUS_SEARCH_TERM = "quartzledger";
export const CORPUS_SEARCH_FOREIGN_TERM = "copperwitness";
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
interface Sources {
  readonly libraries: SeededCorpusLibraries;
  readonly recall: SeededRecallCorpus;
  readonly images: Awaited<ReturnType<typeof seedCorpusKnowledgeImages>>;
  readonly actors: Awaited<ReturnType<typeof seedCorpusActors>>;
}
type SearchOutput = Awaited<ReturnType<Caller["search"]["search"]>>;
type SearchInput = Parameters<Caller["search"]["search"]>[0];
interface SearchReads {
  readonly inputs: readonly SearchInput[];
  readonly outputs: readonly SearchOutput[];
  readonly fields: Awaited<ReturnType<Caller["search"]["fields"]>>;
  readonly suggest: Awaited<ReturnType<Caller["search"]["suggest"]>>;
  readonly similarRaw: Awaited<ReturnType<Caller["search"]["similarArt"]>>;
  readonly similarCaptioned: Awaited<ReturnType<Caller["search"]["similarArt"]>>;
  readonly status: Awaited<ReturnType<Caller["search"]["spaceStatus"]>>;
}
interface LexicalLifecycle {
  readonly named: Awaited<ReturnType<Caller["character"]["create"]>>;
  readonly described: Awaited<ReturnType<Caller["character"]["create"]>>;
  readonly foreign: Awaited<ReturnType<Caller["character"]["create"]>>;
  readonly initial: SearchReads["fields"];
  readonly created: SearchReads["fields"];
  readonly capped: SearchReads["fields"];
  readonly updated: SearchReads["fields"];
  readonly removed: SearchReads["fields"];
  readonly suggestions: SearchReads["suggest"];
  readonly foreignFields: SearchReads["fields"];
  readonly foreignSuggestions: SearchReads["suggest"];
  readonly clockBefore: number;
  readonly clockAfter: number;
}
interface NativeSearchGroup {
  readonly characters: readonly Awaited<ReturnType<Caller["character"]["create"]>>[];
  readonly room: Awaited<ReturnType<Caller["chat"]["startChat"]>>;
  readonly turn: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["send"]>>;
  readonly memory: Awaited<ReturnType<typeof captureChatMemoryRows>>;
  readonly jobs: Awaited<ReturnType<typeof settleCorpusWorkloads>>;
  readonly standalone: Awaited<ReturnType<Caller["chat"]["startChat"]>>;
  readonly standaloneMemory: Awaited<ReturnType<typeof captureChatMemoryRows>>;
}
interface SearchSpaceLifecycle {
  readonly actor: Awaited<ReturnType<ServerTestHarness["actor"]>>;
  readonly initial: SearchReads["status"];
  readonly text: Awaited<ReturnType<typeof seedEmbeddingGeneration>>;
  readonly image: Awaited<ReturnType<typeof seedEmbeddingGeneration>>;
  readonly moving: SearchReads["status"];
  readonly refused: Awaited<ReturnType<typeof searchRefusal>>;
  readonly jobs: Awaited<ReturnType<typeof settleCorpusWorkloads>>;
  readonly settled: SearchReads["status"];
  readonly emptyDocuments: SearchOutput;
  readonly callsBeforeEmpty: readonly (typeof embeddingCalls.$inferSelect)[];
  readonly callsAfterEmpty: readonly (typeof embeddingCalls.$inferSelect)[];
}
interface NativeSearchCanon {
  readonly characters: readonly (typeof characters.$inferSelect)[];
  readonly cards: readonly (typeof characterEmbeddings.$inferSelect)[];
  readonly digests: readonly (typeof chatDigests.$inferSelect)[];
  readonly segments: readonly (typeof chatSegments.$inferSelect)[];
  readonly chunks: readonly (typeof documentChunks.$inferSelect)[];
  readonly generations: readonly (typeof embedGenerations.$inferSelect)[];
  readonly messages: readonly (typeof messages.$inferSelect)[];
}
interface CorpusSearch {
  readonly publicationIds: CorpusSearchLibrary["ids"];
  readonly lexical: LexicalLifecycle;
  readonly group: NativeSearchGroup;
  readonly spaces: SearchSpaceLifecycle;
  readonly reads: SearchReads;
  readonly canonical: NativeSearchCanon;
  readonly scoped: readonly SearchOutput[];
  readonly foreign: readonly SearchOutput[];
  readonly foreignSeed: SearchReads["similarRaw"];
  readonly refusals: readonly Awaited<ReturnType<typeof searchRefusal>>[];
  readonly foreignDocument: Awaited<ReturnType<Caller["databank"]["createFromText"]>>;
  readonly foreignChunks: readonly (typeof documentChunks.$inferSelect)[];
}

async function searchRefusal(operation: Promise<SearchOutput>): Promise<Error | undefined> {
  try {
    await operation;
    return undefined;
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    return error;
  }
}

async function lexicalLifecycle(root: ServerTestHarness, caller: Caller, other: Caller): Promise<LexicalLifecycle> {
  const query = CORPUS_SEARCH_TERM;
  const clockBefore = root.clock.now();
  const initial = await caller.search.fields({ query, topN: 10 });
  const named = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "search-quartz-named", name: query, description: "Names the lexical witness." }),
  });
  const created = await caller.search.fields({ query, topN: 10 });
  const described = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "search-quartz-described", name: "Search witness", description: `Records ${query}.` }),
  });
  const foreign = await other.character.create({
    input: createCharacterSchema.parse({ handle: "search-copper-foreign", name: CORPUS_SEARCH_FOREIGN_TERM, description: "A separate owner's witness." }),
  });
  const capped = await caller.search.fields({ query, topN: 1 });
  const suggestions = await caller.search.suggest({ query: "quartz", limit: 10 });
  await caller.character.update({ characterId: described.id, input: { description: "Records the harbor." } });
  const updated = await caller.search.fields({ query, topN: 10 });
  await caller.character.remove({ characterId: named.id });
  const removed = await caller.search.fields({ query, topN: 10 });
  return {
    named,
    described,
    foreign,
    initial,
    created,
    capped,
    updated,
    removed,
    suggestions,
    foreignFields: await caller.search.fields({ query: CORPUS_SEARCH_FOREIGN_TERM, topN: 10 }),
    foreignSuggestions: await caller.search.suggest({ query: "copper", limit: 10 }),
    clockBefore,
    clockAfter: root.clock.now(),
  };
}

async function nativeGroup(root: ServerTestHarness, caller: Caller, sources: Sources): Promise<NativeSearchGroup> {
  const cards: NativeSearchGroup["characters"][number][] = [];
  for (const suffix of ["first", "second"]) {
    cards.push(
      await caller.character.create({
        input: createCharacterSchema.parse({
          handle: `search-costar-${suffix}`,
          name: `Search co-star ${suffix}`,
          description: "A real co-star witnesses the ledger.",
        }),
      }),
    );
  }
  await caller.connection.setBinding({ task: "chat", connectionId: sources.actors.connections.text.id });
  const room = await caller.chat.startChat({ characterIds: cards.map((card) => card.id), opening: "none" });
  const chatId = room.chat.id;
  await caller.chat.updateTitle({ chatId, title: "Native search observatory" });
  await caller.chat.setGroupConfig({ chatId, config: { output: "per-speaker", cardScope: "scoped", policy: "list" } });
  const principal = await root.principalFor(root.ownerId);
  const turn = await root.services.chat.send({ principal, chatId, content: "Record both co-star witnesses beside the ledger.", timeZone: UTC_TIME_ZONE });
  for (let scene = 0; scene < DEFAULT_MEMORY_DEFAULTS.blockSize + DEFAULT_MEMORY_DEFAULTS.verbatimWindow; scene += 1) {
    await caller.chat.commitMessage({
      chatId,
      content: `Search observatory scene ${scene}: Both witnesses preserve the orbital ledger.`,
      timeZone: UTC_TIME_ZONE,
    });
  }
  const standalone = await caller.chat.startChat({ characterIds: [], opening: "none" });
  await caller.chat.updateTitle({ chatId: standalone.chat.id, title: "Uncredited search transcript" });
  for (let scene = 0; scene <= DEFAULT_MEMORY_DEFAULTS.blockSize + DEFAULT_MEMORY_DEFAULTS.verbatimWindow; scene += 1) {
    await caller.chat.commitMessage({
      chatId: standalone.chat.id,
      content: `Uncredited native scene ${scene}: The orbital ledger records an anonymous witness.`,
      timeZone: UTC_TIME_ZONE,
    });
  }
  const jobs = await settleCorpusWorkloads(root, caller, [
    await caller.workloads.start({ input: { kind: "index", params: { source: "all" } }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "distill-characters", params: {} }, mode: "singular" }),
  ]);
  await root.settleBackground();
  return {
    characters: cards,
    room,
    turn,
    jobs,
    standalone,
    memory: await captureChatMemoryRows(root.db, chatId),
    standaloneMemory: await captureChatMemoryRows(root.db, standalone.chat.id),
  };
}

async function movingSpace(root: ServerTestHarness): Promise<SearchSpaceLifecycle> {
  const actor = await root.actor();
  const principal = await root.principalFor(actor.id);
  const caller = await root.internalCallerFor(actor.id);
  const initial = await caller.search.spaceStatus();
  await seedCorpusConnections(root, principal);
  await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  const chatId = await seedRecallRoom(caller);
  for (let scene = 0; scene <= DEFAULT_MEMORY_DEFAULTS.blockSize + DEFAULT_MEMORY_DEFAULTS.verbatimWindow; scene += 1) {
    await caller.chat.commitMessage({ chatId, content: `Moving-space native history ${scene}: The ledger records a real witness.`, timeZone: UTC_TIME_ZONE });
  }
  const text = await seedEmbeddingGeneration(root.db, root.app.embeddings.resolveGeneration, [actor.id, "embed"]);
  const image = await seedEmbeddingGeneration(root.db, root.app.embeddings.resolveGeneration, [actor.id, "imageEmbed", "embed"]);
  const moving = await caller.search.spaceStatus();
  const refused = await searchRefusal(caller.search.search({ query: "moving ledger", topN: 5, over: "entities", scope: { kind: "owner" } }));
  const callsBeforeEmpty = await root.db.select().from(embeddingCalls).where(eq(embeddingCalls.ownerId, actor.id)).orderBy(embeddingCalls.id);
  const emptyDocuments = await caller.search.search({ query: "bankless ledger", topN: 5, over: "documents", scope: { kind: "owner" } });
  const callsAfterEmpty = await root.db.select().from(embeddingCalls).where(eq(embeddingCalls.ownerId, actor.id)).orderBy(embeddingCalls.id);
  const jobs = await settleCorpusWorkloads(root, caller, [
    await caller.workloads.start({ input: { kind: "index", params: { source: "all" } }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
    await caller.workloads.start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, mode: "singular" }),
  ]);
  await root.settleBackground();
  return { actor, initial, text, image, moving, refused, jobs, emptyDocuments, callsBeforeEmpty, callsAfterEmpty, settled: await caller.search.spaceStatus() };
}

/** Capture genuine routed result arms over already-produced native rows; private captures never become portable fixtures here. */
export async function seedCorpusSearch(root: ServerTestHarness, sources: Sources): Promise<CorpusSearch> {
  const caller = await root.internalCallerFor(root.ownerId);
  const other = await root.internalCallerFor(sources.actors.secondUserId);
  const lexical = await lexicalLifecycle(root, caller, other);
  const foreignDocument = await other.databank.createFromText({
    name: "Foreign search witness",
    text: "The private copper witness records a separate owner's ledger.",
  });
  const ingested = await root.app.databankIngest.ingestDocument({ documentId: foreignDocument.document.id, signal: new AbortController().signal });
  if (ingested.failed.length > 0 || ingested.chunksUpserted === 0) {
    throw new Error("native foreign search exclusion produced no ingested document");
  }
  await other.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  const foreignChatId = await seedRecallRoom(other);
  for (let scene = 0; scene <= DEFAULT_MEMORY_DEFAULTS.blockSize + DEFAULT_MEMORY_DEFAULTS.verbatimWindow; scene += 1) {
    await other.chat.commitMessage({
      chatId: foreignChatId,
      content: `Foreign-space native history ${scene}: A private witness keeps the copper ledger.`,
      timeZone: UTC_TIME_ZONE,
    });
  }
  await settleCorpusWorkloads(root, other, [
    await other.workloads.start({ input: { kind: "index", params: { source: "text" } }, mode: "singular" }),
    await other.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
    await other.workloads.start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, mode: "singular" }),
  ]);
  const foreignChunks = await root.db
    .select()
    .from(documentChunks)
    .where(eq(documentChunks.documentId, foreignDocument.document.id))
    .orderBy(documentChunks.chunkIdx);
  const group = await nativeGroup(root, caller, sources);
  const spaces = await movingSpace(root);
  const pov = group.characters[0];
  const imageSeed = sources.images.cards[0];
  if (pov === undefined || imageSeed === undefined) {
    throw new Error("native search sources lost their group POV or avatar seed");
  }
  const ownerScope = { kind: "owner" } as const;
  const chatScope = { kind: "chat", chatId: group.room.chat.id, scopedCharacterId: pov.id } as const;
  const base = { query: "orbital ledger", topN: 20, rerank: false } as const;
  const inputs: readonly SearchInput[] = [
    ...(["entities", "characters", "discover", "digests", "corpus", "documents"] as const).map((over) => ({ ...base, over, scope: ownerScope })),
    { ...base, over: "segments", scope: chatScope },
    { ...base, over: "images", scope: ownerScope, lens: "image-raw" },
    { ...base, over: "images", scope: ownerScope, lens: "image-captioned" },
  ];
  const outputs: SearchOutput[] = [];
  for (const input of inputs) {
    outputs.push(await caller.search.search(input));
  }
  const scoped: SearchOutput[] = [await caller.search.search({ ...base, over: "digests", scope: chatScope })];
  for (const card of group.characters) {
    scoped.push(await caller.search.search({ ...base, over: "digests", scope: { kind: "character", characterId: card.id } }));
  }
  const foreign: SearchOutput[] = [];
  for (const over of ["digests", "segments"] as const) {
    foreign.push(await other.search.search({ ...base, over, scope: chatScope }));
  }
  const refusals = await Promise.all([
    searchRefusal(caller.search.search({ ...base, over: "segments", scope: { kind: "chat", chatId: group.room.chat.id } })),
    searchRefusal(caller.search.search({ ...base, over: "segments", scope: ownerScope })),
    searchRefusal(caller.search.search({ ...base, over: "images", scope: ownerScope })),
    searchRefusal(caller.search.search({ ...base, over: "documents", scope: chatScope })),
    searchRefusal(caller.search.search({ ...base, over: "characters", scope: chatScope })),
    searchRefusal(caller.search.search({ ...base, query: " ", over: "entities", scope: ownerScope })),
  ]);
  const canonical: NativeSearchCanon = {
    characters: await root.db.select().from(characters).where(eq(characters.ownerId, root.ownerId)).orderBy(characters.id),
    cards: await root.db.select().from(characterEmbeddings).orderBy(characterEmbeddings.characterId),
    digests: await root.db.select().from(chatDigests).orderBy(chatDigests.id),
    segments: await root.db.select().from(chatSegments).orderBy(chatSegments.id),
    chunks: await root.db.select().from(documentChunks).where(eq(documentChunks.documentId, sources.libraries.document.id)).orderBy(documentChunks.chunkIdx),
    generations: await root.db.select().from(embedGenerations).where(eq(embedGenerations.ownerId, root.ownerId)).orderBy(embedGenerations.id),
    messages: await root.db.select().from(messages).orderBy(messages.chatId, messages.seq),
  };
  const reads: SearchReads = {
    inputs,
    outputs,
    fields: await caller.search.fields({ query: "orbital", topN: 20 }),
    suggest: await caller.search.suggest({ query: "orbit", limit: 10 }),
    similarRaw: await caller.search.similarArt({ characterId: imageSeed.id, topN: 20, lens: "image-raw" }),
    similarCaptioned: await caller.search.similarArt({ characterId: imageSeed.id, topN: 20, lens: "image-captioned" }),
    status: await caller.search.spaceStatus(),
  };
  const foreignSeed = await other.search.similarArt({ characterId: imageSeed.id, topN: 20 });
  await root.settleBackground();
  return {
    publicationIds: { chatId: group.room.chat.id, povId: pov.id, imageSeedId: imageSeed.id },
    lexical,
    group,
    spaces,
    reads,
    canonical,
    scoped,
    foreign,
    foreignSeed,
    refusals,
    foreignDocument,
    foreignChunks,
  };
}

async function capture<P extends TrpcProcedurePath>(input: TrpcInput<P>, invoke: (input: TrpcInput<P>) => Promise<TrpcWireOutput<P>>): Promise<CorpusRead<P>> {
  return { input, output: await invoke(input) };
}

/** Refresh through the real owners after later producers; earlier lexical, scoped and moving captures stay separate. */
export async function captureCorpusSearchPublication(root: ServerTestHarness, source: Pick<CorpusSearch, "publicationIds">): Promise<CorpusSearchLibrary> {
  await root.settleBackground();
  const caller = await root.internalCallerFor(root.ownerId);
  const inputs = corpusSearchInput(source.publicationIds);
  const reads: CorpusSearchLibrary["reads"] = {
    viewer: await capture<"sessions.me">(inputs.viewer, caller.sessions.me),
    entities: await capture<"search.search">(inputs.entities, caller.search.search),
    characters: await capture<"search.search">(inputs.characters, caller.search.search),
    discover: await capture<"search.search">(inputs.discover, caller.search.search),
    digests: await capture<"search.search">(inputs.digests, caller.search.search),
    corpus: await capture<"search.search">(inputs.corpus, caller.search.search),
    documents: await capture<"search.search">(inputs.documents, caller.search.search),
    segments: await capture<"search.search">(inputs.segments, caller.search.search),
    imagesRaw: await capture<"search.search">(inputs.imagesRaw, caller.search.search),
    imagesCaptioned: await capture<"search.search">(inputs.imagesCaptioned, caller.search.search),
    fields: await capture<"search.fields">(inputs.fields, caller.search.fields),
    suggest: await capture<"search.suggest">(inputs.suggest, caller.search.suggest),
    similarRaw: await capture<"search.similarArt">(inputs.similarRaw, caller.search.similarArt),
    similarCaptioned: await capture<"search.similarArt">(inputs.similarCaptioned, caller.search.similarArt),
    status: await capture<"search.spaceStatus">(inputs.status, caller.search.spaceStatus),
  };
  const chatIds = new Set([
    source.publicationIds.chatId,
    ...corpusSearchRoomIds([
      reads.entities.output,
      reads.characters.output,
      reads.discover.output,
      reads.digests.output,
      reads.corpus.output,
      reads.documents.output,
      reads.segments.output,
      reads.imagesRaw.output,
      reads.imagesCaptioned.output,
    ]),
  ]);
  const rooms: CorpusRead<"chat.getChat">[] = [];
  for (const chatId of [...chatIds].sort()) {
    rooms.push(await capture<"chat.getChat">({ chatId: typeIdSchema(ID_PREFIX.chat).parse(chatId) }, caller.chat.getChat));
  }
  return { viewerUserId: root.ownerId, ids: source.publicationIds, rooms, reads };
}
