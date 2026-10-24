// @subject tests/support/node/corpus-search.ts
import type { CorpusSource } from "@orb/contracts/search";
import { assertReferentialIntegrity } from "@orb/db";
import { corpusKnowledgeText } from "./corpus-knowledge.ts";
import { seedCorpusKnowledgeImages } from "./corpus-knowledge-images.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import { CORPUS_SEARCH_FOREIGN_TERM, CORPUS_SEARCH_TERM, seedCorpusSearch } from "./corpus-search.ts";
import { seedCorpusActors, seedCorpusLibraries, seedRecallCorpus } from "./corpus-seed.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness } from "./server.ts";

type SearchCapture = Awaited<ReturnType<typeof seedCorpusSearch>>;

function assertRoutedArms(
  result: SearchCapture,
  libraries: Awaited<ReturnType<typeof seedCorpusLibraries>>,
  images: Awaited<ReturnType<typeof seedCorpusKnowledgeImages>>,
): void {
  const entities = result.reads.outputs.find((output) => output.over === "entities");
  const characters = result.reads.outputs.find((output) => output.over === "characters");
  const discover = result.reads.outputs.find((output) => output.over === "discover");
  const digests = result.reads.outputs.find((output) => output.over === "digests");
  const corpus = result.reads.outputs.find((output) => output.over === "corpus");
  const segments = result.reads.outputs.find((output) => output.over === "segments");
  const documents = result.reads.outputs.find((output) => output.over === "documents");
  if (
    entities === undefined ||
    characters === undefined ||
    discover === undefined ||
    digests === undefined ||
    corpus === undefined ||
    segments === undefined ||
    documents === undefined
  ) {
    throw new Error("native routed search lost a required result arm");
  }
  expect(entities.hits.every((hit) => result.canonical.cards.some((row) => row.characterId === hit.characterId))).toBe(true);
  expect(characters.hits.every((hit) => hit.name.length > 0)).toBe(true);
  expect(characters.hits.some((hit) => hit.genre === "science-fiction")).toBe(true);
  expect(discover.hits.every((hit) => hit.name.length > 0 && hit.segments.length > 0)).toBe(true);
  expect(discover.standaloneSegments.some((hit) => hit.chatId === result.group.standalone.chat.id)).toBe(true);
  for (const hit of discover.standaloneSegments) {
    assertNativeSource(hit.source, result);
  }
  for (const source of discover.hits.flatMap((hit) => hit.segments.map((segment) => segment.source))) {
    assertNativeSource(source, result);
  }
  for (const hit of digests.hits) {
    assertNativeSource(hit.source, result);
    expect(hit.blockKey).toMatchObject({ chatId: hit.source.chatId, blockIdx: hit.source.blockIdx, scopedCharacterId: hit.source.scopedCharacterId });
  }
  for (const character of result.group.characters) {
    expect(
      digests.hits.find((hit) => hit.source.chatId === result.group.room.chat.id && hit.source.scopedCharacterId === character.id)?.scopedCharacterName,
    ).toBe(character.name);
  }
  const unnamed = digests.hits.find((hit) => hit.scopedCharacterName === null);
  if (unnamed === undefined) {
    throw new Error("native unnamed digest producer is missing");
  }
  expect(result.canonical.characters.find((card) => card.id === unnamed.blockKey.scopedCharacterId)).toMatchObject({ synthetic: true });
  expect(result.group.standaloneMemory.digests).toEqual([]);
  expect(new Set(corpus.hits.map((hit) => hit.source.kind))).toEqual(new Set(["digest", "segment"]));
  for (const hit of corpus.hits) {
    assertNativeSource(hit.source, result);
  }
  expect(segments.hits.every((hit) => hit.blockKey.chatId === result.group.room.chat.id && hit.blockKey.tier === 0)).toBe(true);
  expect(segments.hits.every((hit) => result.group.memory.segments.some((row) => row.blockIdx === hit.blockKey.blockIdx && row.text === hit.text))).toBe(true);
  expect(documents.hits.map((hit) => hit.chunkId)).toEqual(result.canonical.chunks.map((row) => row.id));
  expect(result.foreignChunks.length).toBeGreaterThan(0);
  expect(documents.hits.some((hit) => hit.documentId === result.foreignDocument.document.id)).toBe(false);
  for (const hit of documents.hits) {
    const row = result.canonical.chunks.find((chunk) => chunk.id === hit.chunkId);
    expect(hit).toMatchObject({
      documentId: libraries.document.id,
      documentName: libraries.document.name,
      chunkIdx: row?.chunkIdx,
      content: row?.content,
      contentHash: row?.contentHash,
    });
  }
  for (const output of result.reads.outputs.filter((row) => row.over === "images")) {
    expect(output.hits.every((hit) => hit.characterId !== null && hit.characterName !== null)).toBe(true);
    for (const [index, asset] of images.assets.entries()) {
      expect(output.hits.find((hit) => hit.assetId === asset.id)).toMatchObject({ hash: asset.hash, characterId: images.cards[index]?.id });
    }
  }
}

function assertNativeSource(source: CorpusSource, result: SearchCapture): void {
  const rows = source.kind === "digest" ? result.canonical.digests : result.canonical.segments;
  const row = rows.find((candidate) => candidate.id === source.rowId);
  if (row === undefined) {
    throw new Error("routed native search source has no retained canonical row");
  }
  expect(source).toMatchObject({ generationId: row.generationId, contentHash: row.contentHash, chatId: row.chatId, blockIdx: row.blockIdx });
  const segment = result.canonical.segments.find((candidate) => candidate.id === source.rowId);
  expect(source.kind === "segment" ? [source.seqStart, source.seqEnd, source.chunkIdx] : null).toEqual(
    segment === undefined ? null : [segment.seqStart, segment.seqEnd, segment.chunkIdx],
  );
  const generation = result.canonical.generations.find((candidate) => candidate.id === row.generationId);
  if (generation === undefined) {
    throw new Error("routed native source has no owner generation");
  }
  expect(source.fingerprint).toBe(generation.fingerprint);
  for (const [id, seq] of [
    [source.messageStartId, source.seqStart],
    [source.messageEndId, source.seqEnd],
  ] as const) {
    expect(id).not.toBeNull();
    expect(result.canonical.messages.find((message) => message.id === id)).toMatchObject({ chatId: source.chatId, seq });
  }
}

// Producing the whole search corpus takes about 6 s of real producer work, with no held resource and no wall-clock wait.
test("native search exposes all eight routed arms and five output families with genuine provenance, scopes and lexical publication", {
  tags: ["slow"],
}, async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: corpusKnowledgeText,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const actors = await seedCorpusActors(root);
  const libraries = await seedCorpusLibraries(root);
  const recall = await seedRecallCorpus(root, {
    chatConnectionId: actors.connections.text.id,
    embedConnectionId: actors.connections.embed.id,
    summarizeConnectionId: actors.connections.text.id,
  });
  const images = await seedCorpusKnowledgeImages(root);
  const result = await seedCorpusSearch(root, { actors, libraries, recall, images });
  expect(new Set(result.reads.outputs.map((output) => output.over))).toEqual(
    new Set(["entities", "characters", "discover", "segments", "digests", "corpus", "images", "documents"]),
  );
  for (const output of result.reads.outputs) {
    expect(output.hits.length, output.over).toBeGreaterThan(0);
    expect(output.coverage).toMatchObject({ requestLimit: 20, reranked: false });
    expect(output.hits.length).toBeLessThanOrEqual(output.coverage.requestLimit);
  }
  assertRoutedArms(result, libraries, images);
  const lexical = result.lexical;
  expect(lexical.initial.hits).toEqual([]);
  expect(lexical.created.hits.map((hit) => hit.characterId)).toEqual([lexical.named.id]);
  expect(lexical.created.coverage.indexedCharacters).toBe(lexical.initial.coverage.indexedCharacters + 1);
  expect(lexical.capped.hits.map((hit) => hit.characterId)).toEqual([lexical.named.id]);
  expect(lexical.capped.coverage).toEqual({ requestLimit: 1, indexedCharacters: lexical.initial.coverage.indexedCharacters + 2, matchingCharacters: 2 });
  expect(lexical.updated.hits.map((hit) => hit.characterId)).toEqual([lexical.named.id]);
  expect(lexical.updated.coverage.matchingCharacters).toBe(1);
  expect(lexical.removed.hits).toEqual([]);
  expect(lexical.removed.coverage).toEqual({ requestLimit: 10, indexedCharacters: lexical.initial.coverage.indexedCharacters + 1, matchingCharacters: 0 });
  expect(lexical.clockAfter).toBe(lexical.clockBefore);
  expect(lexical.suggestions.map((row) => row.suggestion)).toContain(CORPUS_SEARCH_TERM);
  expect(lexical.foreignFields.hits).toEqual([]);
  expect(lexical.foreignSuggestions).toEqual([]);
  expect(JSON.stringify(result.reads)).not.toContain(CORPUS_SEARCH_FOREIGN_TERM);
  expect(result.reads.fields.hits.length).toBeGreaterThan(0);
  expect(result.reads.suggest.length).toBeGreaterThan(0);
  for (const hits of [result.reads.similarRaw, result.reads.similarCaptioned]) {
    expect(hits.map((hit) => hit.characterId)).toEqual([images.cards[1]?.id]);
    expect(hits[0]?.avatarHash).toBe(images.assets[1]?.hash);
  }
  expect(result.foreignSeed).toEqual([]);
  expect(result.foreign.map((output) => output.hits)).toEqual([[], []]);
  expect(result.scoped.every((output) => output.hits.length > 0)).toBe(true);
  const chatRead = result.scoped[0];
  if (chatRead?.over !== "digests") {
    throw new Error("native chat scope did not return its digest arm");
  }
  expect(
    chatRead.hits.every((hit) => hit.blockKey.chatId === result.group.room.chat.id && hit.blockKey.scopedCharacterId === result.group.characters[0]?.id),
  ).toBe(true);
  expect(result.refusals).toMatchObject([
    { cause: { code: "scope_required" } },
    { cause: { code: "scope_unsupported" } },
    { cause: { code: "lens_required" } },
    { cause: { code: "scope_unsupported" } },
    { cause: { code: "scope_unsupported" } },
    { cause: { code: "empty_query" } },
  ]);
  expect(result.spaces.initial).toEqual({ paused: false, embed: false, imageEmbed: false });
  expect(result.spaces.moving).toEqual({ paused: true, embed: true, imageEmbed: true });
  expect(result.spaces.refused).toMatchObject({ cause: { code: "search_space_reindexing" } });
  expect(result.spaces.emptyDocuments.hits).toEqual([]);
  expect(result.spaces.callsAfterEmpty).toEqual(result.spaces.callsBeforeEmpty);
  expect(result.spaces.settled).toEqual({ paused: false, embed: false, imageEmbed: false });
  expect(result.reads.status).toEqual(result.spaces.settled);
  const coStar = result.group.characters[1];
  if (coStar === undefined) {
    throw new Error("native group lost its second real character");
  }
  const coStarCredit = result.group.memory.speakers.find(
    (credit) =>
      credit.characterId === coStar.id && result.group.memory.digests.some((digest) => digest.id === credit.digestId && digest.scopedCharacterId !== coStar.id),
  );
  expect(coStarCredit).toBeDefined();
  const coStarRead = result.scoped[2];
  if (coStarRead?.over !== "digests") {
    throw new Error("native co-star scope did not return its digest arm");
  }
  expect(coStarRead.hits.some((hit) => hit.source.rowId === coStarCredit?.digestId)).toBe(true);
  await assertReferentialIntegrity(root.db);
});
