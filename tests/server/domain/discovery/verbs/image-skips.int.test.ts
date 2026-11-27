// @subject packages/server/src/domain/discovery/image-analytics/facets.ts
// @subject packages/server/src/domain/discovery/persistence/embed-store-reads.ts
// An image the indexer refused names its reason and its measured size to the owner who stored it, and to nobody else.

import { IMAGE_SKIP_REASONS } from "@orb/contracts/embeddings";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  freshHeldDb,
  makeAssetBytes,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";

test("a stored image below the indexer's floor is listed with its reason and size for its owner only", async () => {
  using held = await freshHeldDb();
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ db: held.db, providerFetch: physical.execute, startJobs: false, logLevel: "error" });
  const owner = await root.principalFor(root.ownerId);
  const stored = await root.app.assets.store({
    principal: owner,
    bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
    mime: "image/png",
    kind: "avatar",
  });
  await root.settleBackground();
  await seedCorpusConnections(root, owner);
  expect(await root.app.embeddings.indexAsset(stored.assetId, { signal: new AbortController().signal })).toBeNull();

  const skips = await root.services.discovery.imageSkips(owner.userId);
  expect(skips).toHaveLength(1);
  const [skip] = skips;
  expect(skip?.assetId).toBe(stored.assetId);
  expect(IMAGE_SKIP_REASONS).toContain(skip?.reason);
  expect(skip?.width).toBeGreaterThan(0);
  expect(skip?.height).toBeGreaterThan(0);

  // Control: another owner's read lists none of it.
  expect(await root.services.discovery.imageSkips(root.idSource.userId())).toEqual([]);
});
