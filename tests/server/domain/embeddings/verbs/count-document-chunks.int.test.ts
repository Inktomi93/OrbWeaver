// verb: countDocumentChunks — the DocumentView chunk-count read the databank domain injects (embeddings owns
// `document_chunks`). Returns a Map keyed by documentId for the active model; documents with zero chunks are
// absent (the caller defaults to 0); a different model scopes to zero; empty input → empty map.

import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { EMBED_DIM, EMBED_MODEL, makeStoreHarness, seedDocument, seedUser } from "../_support.ts";

async function storeChunk(svc: ReturnType<typeof createEmbeddingsService>, documentId: string, chunkIdx: number): Promise<void> {
  await svc.store({
    kind: "document",
    lens: "chunk",
    content: `chunk ${chunkIdx} content`,
    model: EMBED_MODEL,
    dim: EMBED_DIM,
    // biome-ignore lint/suspicious/noExplicitAny: the branded DocumentId is produced by seedDocument; the test passes it straight back through the store arm.
    fkRefs: { documentId: documentId as any, chunkIdx, charStart: chunkIdx * 10, charEnd: chunkIdx * 10 + 10 },
  });
}

test("counts a document's chunks for the active model, grouped; other model → absent", async () => {
  const db = await freshDb();
  const h = makeStoreHarness(db);
  const svc = createEmbeddingsService(h.ctx);
  const owner = await seedUser(db, { handle: "owner" });
  const docA = await seedDocument(db, owner, { id: "document_a", text: "a" });
  const docB = await seedDocument(db, owner, { id: "document_b", text: "b" });
  await storeChunk(svc, docA, 0);
  await storeChunk(svc, docA, 1);
  await storeChunk(svc, docB, 0);

  const counts = await svc.countDocumentChunks({ documentIds: [docA, docB], model: EMBED_MODEL });
  expect(counts.get(docA)).toBe(2);
  expect(counts.get(docB)).toBe(1);

  const otherSpace = await svc.countDocumentChunks({ documentIds: [docA], model: "some-other-model" });
  expect(otherSpace.get(docA)).toBeUndefined();
  expect((await svc.countDocumentChunks({ documentIds: [], model: EMBED_MODEL })).size).toBe(0);
});
