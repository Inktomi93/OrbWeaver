// @subject tests/support/node/factories/embedding-generation.ts
// @subject tests/support/node/corpus-provider.ts

import { readSeedAvatar } from "@orb/default-content";
import { ID_PREFIX } from "@orb/kit/ids";
import { WELCOME_ASSISTANT_HANDLE } from "@orb/server/domain/character";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "../corpus-provider.ts";
import { seedCorpusConnections } from "../corpus-seed.ts";
import { expect, test } from "../fixtures.ts";
import { createServerHarness } from "../server.ts";
import { makeAssetBytes } from "./asset.ts";
import { seedIndexedAsset } from "./embedding-generation.ts";

function imageProvider(): ReturnType<typeof createCorpusProviderExecution> {
  return createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The traveller repairs the orbital loom.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
}

test("the real image indexer produces caption analysis and its exact captioned vector under admitted text fallback", async () => {
  const wire = imageProvider();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const principal = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, principal);
  const avatar = await readSeedAvatar(WELCOME_ASSISTANT_HANDLE);
  if (avatar === null) {
    throw new Error("production bundled avatar bytes are missing");
  }
  const stored = await root.app.assets.store({ principal, ...avatar, kind: "avatar" });
  await root.settleBackground();
  const capture = await seedIndexedAsset(root, [stored.assetId, { force: true, signal: new AbortController().signal }]);
  expect(capture.result?.outcome).toBe("written");
  expect(capture.skip).toBeUndefined();
  expect(capture.analysis).toMatchObject({
    assetId: stored.assetId,
    contentHash: stored.hash,
    captionMeta: { model: CORPUS_TEXT_MODEL, artStyle: "illustration" },
  });
  expect(capture.vectors.map((row) => row.lens)).toEqual(["image-captioned"]);
  expect(capture.vectors.map((row) => row.assetId)).toEqual([stored.assetId]);
  expect(capture.vectors.map((row) => row.generationId)).toEqual([capture.result?.generationId]);
  expect(capture.vectors.map((row) => row.contentHash)).toEqual([capture.analysis?.contentHash]);
  expect(capture.vectors.map((row) => Array.from(row.embedding))).toEqual([[...CORPUS_EMBEDDING_VECTOR]]);
  expect(wire.requests).toContain("POST /v1/chat/completions");
  expect(wire.requests).toContain("POST /v1/embeddings");
});

test("real eight-pixel input records the producer's skip and spends no caption or vector request", async () => {
  const wire = imageProvider();
  await using root = await createServerHarness({ providerFetch: wire.execute });
  const principal = await root.principalFor(root.ownerId);
  await seedCorpusConnections(root, principal);
  const before = wire.requests.filter((request) => request.startsWith("POST "));
  const bytes = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  const stored = await root.app.assets.store({ principal, bytes, mime: "image/png", kind: "avatar" });
  await root.settleBackground();
  const capture = await seedIndexedAsset(root, [stored.assetId, { force: true }]);
  expect(capture.result).toBeNull();
  expect(capture.vectors).toEqual([]);
  expect(capture.analysis).toBeUndefined();
  expect(capture.skip).toMatchObject({ assetId: stored.assetId, reason: "below-dimension-floor", width: 8, height: 8 });
  const repeated = await seedIndexedAsset(root, [stored.assetId, { force: false }]);
  expect(repeated).toEqual(capture);
  expect(wire.requests.filter((request) => request.startsWith("POST "))).toEqual(before);
});
