// Vector retrieval derives owner scope from the producer; another user's search never returns the owner's rows.
// @subject packages/server/src/domain/search/persistence/digest-rows.ts
// @subject packages/server/src/domain/embeddings/persistence/queries.ts
import type { CorpusSource } from "@orb/contracts/search";
import { chatDigests, chatSegments } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
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
import { eq } from "drizzle-orm";

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
