// verb: pruneDocumentChunks — databank-design/05 §2.4, the reindex-shrink seam. After the ingest upserts a
// document's current chunks, this reclaims the strays: tail rows (chunkIdx >= keepCount, a shrunk set) AND
// rows in a retired (model) space, scoped to the one document. Load-bearing: it is the ONLY non-store write
// to document_chunks the databank domain reaches (via injection), and it must never touch another document.

import { documentChunks } from "@orb/db";
import type { DocumentId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { EMBED_DIM, EMBED_MODEL, embedAs, makeStoreHarness, seedDocument, seedUser } from "../_support.ts";

const OLD_MODEL = "old-embed-model-v1";

/** Store `count` chunks (idx 0..count-1) for `documentId` in `model` via the ONE write path. Distinct
 *  chunkIdx keys ⇒ no upsert contention, so the inserts run concurrently. */
function storeChunks(svc: ReturnType<typeof createEmbeddingsService>, documentId: DocumentId, count: number, model: string): Promise<unknown> {
  return Promise.all(
    Array.from({ length: count }, (_, i) =>
      svc.store({
        kind: "document",
        lens: "chunk",
        content: `chunk ${i} in ${model}`,
        model,
        dim: EMBED_DIM,
        fkRefs: { documentId, chunkIdx: i, charStart: i, charEnd: i + 1 },
        ownerId: owner,
      }),
    ),
  );
}

describe("pruneDocumentChunks (databank-design/05 §2.4)", () => {
  test("shrinks the tail: keepCount deletes exactly chunkIdx >= keepCount, survivors intact", async () => {
    const db = await freshDb();
    const svc = createEmbeddingsService(makeStoreHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const documentId = await seedDocument(db, owner);
    await storeChunks(svc, documentId, 5, EMBED_MODEL); // idx 0..4

    const { rowsDeleted } = await svc.pruneDocumentChunks({ documentId, keepCount: 3, model: EMBED_MODEL });

    expect(rowsDeleted).toBe(2); // idx 3, 4
    const rows = await db.select().from(documentChunks).where(eq(documentChunks.documentId, documentId));
    expect(rows.map((r) => r.chunkIdx).sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  test("reclaims a retired (model) space regardless of keepCount", async () => {
    const db = await freshDb();
    const harness = makeStoreHarness(db);
    const svc = createEmbeddingsService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const documentId = await seedDocument(db, owner);
    // The retired space must come from the PROVIDER, not the params — see embedAs.
    embedAs(harness, OLD_MODEL);
    await storeChunks(svc, documentId, 3, OLD_MODEL); // the old space
    embedAs(harness, EMBED_MODEL);
    await storeChunks(svc, documentId, 3, EMBED_MODEL); // the active space

    // keepCount high enough to keep every active-space tail — only the retired space is reclaimed.
    const { rowsDeleted } = await svc.pruneDocumentChunks({ documentId, keepCount: 3, model: EMBED_MODEL });

    expect(rowsDeleted).toBe(3); // all OLD_MODEL rows
    const rows = await db.select().from(documentChunks).where(eq(documentChunks.documentId, documentId));
    expect(rows.map((r) => r.model)).toEqual([EMBED_MODEL, EMBED_MODEL, EMBED_MODEL]);
  });

  test("never touches another document's chunks", async () => {
    const db = await freshDb();
    const svc = createEmbeddingsService(makeStoreHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const docA = await seedDocument(db, owner, { id: "document_a" });
    const docB = await seedDocument(db, owner, { id: "document_b" });
    await storeChunks(svc, docA, 4, EMBED_MODEL);
    await storeChunks(svc, docB, 4, EMBED_MODEL);

    await svc.pruneDocumentChunks({ documentId: docA, keepCount: 1, model: EMBED_MODEL });

    expect(await db.select().from(documentChunks).where(eq(documentChunks.documentId, docA))).toHaveLength(1);
    expect(await db.select().from(documentChunks).where(eq(documentChunks.documentId, docB))).toHaveLength(4); // untouched
  });
});
