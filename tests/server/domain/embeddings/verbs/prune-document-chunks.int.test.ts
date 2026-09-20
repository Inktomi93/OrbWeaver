// verb: pruneDocumentChunks — databank-design/05 §2.4, the reindex-shrink seam. After the ingest upserts a
// document's current chunks, this reclaims the strays: tail rows (chunkIdx >= keepCount, a shrunk set) AND
// rows in a retired (model) space, scoped to the one document. Load-bearing: it is the ONLY non-store write
// to document_chunks the databank domain reaches (via injection), and it must never touch another document.

import type { Db } from "@orb/db";
import { documentChunks, userConnections } from "@orb/db";
import type { DocumentId, Handle, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { describe, vi } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import type { StoreHarness } from "../_support.ts";
import { EMBED_DIM, EMBED_MODEL, embedAs, makeStoreHarness, seedDocument, seedUser } from "../_support.ts";

const OLD_MODEL = "old-embed-model-v1";

async function seedHarnessConnection(db: Db, ownerId: UserId, harness: StoreHarness): Promise<void> {
  const resolved = await harness.roleClients.resolved("embed");
  if (resolved === null) {
    throw new Error("the document fixture needs an embed connection");
  }
  await db.insert(userConnections).values({
    id: resolved.connectionId,
    ownerId,
    label: "document prune embed",
    providerId: resolved.providerId,
    model: resolved.model,
  });
}

/** Store `count` chunks (idx 0..count-1) for `documentId` in `model` via the ONE write path. Distinct
 *  chunkIdx keys ⇒ no upsert contention, so the inserts run concurrently. */
function storeChunks(
  svc: ReturnType<typeof createEmbeddingsService>,
  args: { documentId: DocumentId; count: number; model: string; ownerId: UserId },
): Promise<unknown> {
  const { documentId, count, model, ownerId } = args;
  return Promise.all(
    Array.from({ length: count }, (_, i) =>
      svc.store({
        kind: "document",
        lens: "chunk",
        content: `chunk ${i} in ${model}`,
        model,
        dim: EMBED_DIM,
        fkRefs: { documentId, chunkIdx: i, charStart: i, charEnd: i + 1 },
        ownerId,
      }),
    ),
  );
}

describe("pruneDocumentChunks (databank-design/05 §2.4)", () => {
  test("shrinks the tail: keepCount deletes exactly chunkIdx >= keepCount, survivors intact", async () => {
    const db = await freshDb();
    const harness = makeStoreHarness(db);
    const svc = createEmbeddingsService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedHarnessConnection(db, owner, harness);
    const documentId = await seedDocument(db, owner);
    await storeChunks(svc, { documentId, count: 5, model: EMBED_MODEL, ownerId: owner }); // idx 0..4

    const { rowsDeleted } = await svc.pruneDocumentChunks({ documentId, keepCount: 3, model: EMBED_MODEL });

    expect(rowsDeleted).toBe(2); // idx 3, 4
    const rows = await db.select().from(documentChunks).where(eq(documentChunks.documentId, documentId));
    expect(rows.map((r) => r.chunkIdx).sort((a, b) => a - b)).toEqual([0, 1, 2]);
  });

  test("retains the retired generation while pruning the pending generation's tail", async () => {
    const db = await freshDb();
    const harness = makeStoreHarness(db);
    const svc = createEmbeddingsService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedHarnessConnection(db, owner, harness);
    const documentId = await seedDocument(db, owner);
    // The retired generation comes from the connection snapshot, while the stored model comes from the
    // provider reply. Move both together to model the same connection changing models between sweeps.
    const resolve = harness.roleClients.resolved.bind(harness.roleClients);
    const active = await resolve("embed");
    if (active === null) {
      throw new Error("the document fixture needs an embed connection");
    }
    const resolved = vi
      .spyOn(harness.roleClients, "resolved")
      .mockImplementation((task) => (task === "embed" ? Promise.resolve({ ...active, model: castId<ModelId>(OLD_MODEL) }) : resolve(task)));
    await db.update(userConnections).set({ model: OLD_MODEL }).where(eq(userConnections.id, active.connectionId));
    embedAs(harness, OLD_MODEL);
    await storeChunks(svc, { documentId, count: 3, model: OLD_MODEL, ownerId: owner }); // the old space
    resolved.mockImplementation(resolve);
    await db.update(userConnections).set({ model: EMBED_MODEL }).where(eq(userConnections.id, active.connectionId));
    embedAs(harness, EMBED_MODEL);
    await storeChunks(svc, { documentId, count: 4, model: EMBED_MODEL, ownerId: owner }); // the pending space

    // Promotion owns retired-generation reclamation. This post-ingest prune may delete only the pending
    // generation's surplus tail; the still-active old generation remains readable until the joint swap.
    const { rowsDeleted } = await svc.pruneDocumentChunks({ documentId, keepCount: 3, model: EMBED_MODEL });

    expect(rowsDeleted).toBe(1); // pending generation idx 3 only
    const rows = await db.select().from(documentChunks).where(eq(documentChunks.documentId, documentId));
    expect(rows.filter((row) => row.model === OLD_MODEL)).toHaveLength(3);
    expect(rows.filter((row) => row.model === EMBED_MODEL)).toHaveLength(3);
  });

  test("never touches another document's chunks", async () => {
    const db = await freshDb();
    const harness = makeStoreHarness(db);
    const svc = createEmbeddingsService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedHarnessConnection(db, owner, harness);
    const docA = await seedDocument(db, owner, { id: "document_a" });
    const docB = await seedDocument(db, owner, { id: "document_b" });
    await storeChunks(svc, { documentId: docA, count: 4, model: EMBED_MODEL, ownerId: owner });
    await storeChunks(svc, { documentId: docB, count: 4, model: EMBED_MODEL, ownerId: owner });

    await svc.pruneDocumentChunks({ documentId: docA, keepCount: 1, model: EMBED_MODEL });

    expect(await db.select().from(documentChunks).where(eq(documentChunks.documentId, docA))).toHaveLength(1);
    expect(await db.select().from(documentChunks).where(eq(documentChunks.documentId, docB))).toHaveLength(4); // untouched
  });
});
