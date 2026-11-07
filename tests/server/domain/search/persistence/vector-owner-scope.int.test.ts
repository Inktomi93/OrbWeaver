// Vector retrieval derives owner scope from the producer: a second user with the same embedding space
// retrieves none of the owner's stored chat_digests or chat_segments row ids. A card derives it from `characters.ownerId`
// alone, because a generation is not an ownership link (D20), so that scan is read with no generation to narrow it.
// @subject packages/server/src/domain/search/persistence/digest-rows.ts
// @subject packages/server/src/domain/search/persistence/nearest.ts
// @subject packages/server/src/domain/embeddings/persistence/queries.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { CorpusSource } from "@orb/contracts/search";
import { characterEmbeddings, chatDigests, chatSegments } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusConnections,
  seedRecallCorpus,
} from "@orb/testkit/node/composed";
import { eq, inArray } from "drizzle-orm";
import { nearestCharacters } from "#server/domain/search/persistence/nearest.ts";

test("a second user with the same embedding space retrieves none of the owner's digest or segment rows", async () => {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller preserves the ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal: owner, partial: { privateEndpointAllowlist: ["127.0.0.1"] } });
  const connections = await seedCorpusConnections(root, owner);
  const corpus = await seedRecallCorpus(root, {
    chatConnectionId: connections.text.id,
    embedConnectionId: connections.embed.id,
    summarizeConnectionId: connections.text.id,
  });
  const stored = {
    digests: await root.db.select({ id: chatDigests.id }).from(chatDigests).where(eq(chatDigests.chatId, corpus.chatId)),
    segments: await root.db.select({ id: chatSegments.id }).from(chatSegments).where(eq(chatSegments.chatId, corpus.chatId)),
  };
  expect(stored.digests.length).toBeGreaterThan(0);
  expect(stored.segments.length).toBeGreaterThan(0);
  const query = { queryText: "ledger", mode: "mixB", minScore: 0 } as const;
  const sources = async (ownerId: UserId): Promise<CorpusSource[]> => {
    const corpusHits = await root.services.search.corpus({ ownerId, ...query });
    const discovered = await root.services.search.discover({ ownerId, queryText: query.queryText, topN: 10 });
    return [
      ...corpusHits.map((hit) => hit.source),
      ...discovered.standaloneSegments.map((hit) => hit.source),
      ...discovered.hits.flatMap((hit) => hit.segments.map((segment) => segment.source)),
    ];
  };
  expect(new Set((await sources(owner.userId)).map((source) => source.kind))).toEqual(new Set(["digest", "segment"]));

  const other = await root.principalFor((await root.actor()).id);
  await seedCorpusConnections(root, other);
  expect(await sources(other.userId)).toEqual([]);
});

test("the owner predicate alone keeps a stranger's embedded card out of a card scan no generation narrows", async () => {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller preserves the ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const owner = await root.principalFor(root.ownerId);
  await root.services.settings.updateAppSettings({ principal: owner, partial: { privateEndpointAllowlist: ["127.0.0.1"] } });
  const stranger = await root.principalFor((await root.actor()).id);
  await seedCorpusConnections(root, owner);
  await seedCorpusConnections(root, stranger);
  const card = async (principal: typeof owner, handle: string): Promise<CharacterId> =>
    (
      await root.services.character.create({
        principal,
        input: createCharacterSchema.parse({ handle, name: handle, description: "A traveller repairs the loom." }),
      })
    ).id;
  const own = await card(owner, "scan-own");
  const foreign = await card(stranger, "scan-foreign");
  await root.settleBackground();
  for (const { userId } of [owner, stranger]) {
    await root.app.embeddings.embedCorpus({ ownerId: userId, force: true, signal: new AbortController().signal });
  }

  // Both cards are really embedded, in one model and width and on one vector, so nothing but the owner tells them apart.
  const stored = await root.db
    .select()
    .from(characterEmbeddings)
    .where(inArray(characterEmbeddings.characterId, [own, foreign]));
  const first = stored[0];
  if (first === undefined) {
    throw new Error("no card was embedded");
  }
  expect(stored.map((row) => row.characterId).toSorted()).toEqual([own, foreign].toSorted());
  expect(new Set(stored.map((row) => row.model))).toEqual(new Set([first.model]));
  expect(new Set(stored.map((row) => Array.from(row.embedding).join()))).toEqual(new Set([Array.from(first.embedding).join()]));

  const scan = async (ownerId: UserId): Promise<readonly CharacterId[]> =>
    (await nearestCharacters(root.db, { ownerId, queryVector: first.embedding, model: first.model, limit: 10 })).map((hit) => hit.characterId);
  const ownerHits = await scan(owner.userId);
  expect(ownerHits).toContain(own);
  expect(ownerHits).not.toContain(foreign);
  const strangerHits = await scan(stranger.userId);
  expect(strangerHits).toContain(foreign);
  expect(strangerHits).not.toContain(own);
});
