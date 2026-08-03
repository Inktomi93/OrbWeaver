// verb: purgeDocumentVectors — PD-139(c), the databank arm of the PD-104 old-space reclaim. After a BULK
// databank-reindex re-embeds every document chunk into the box's active embed (model) space, rows left in any
// OTHER space are stranded (document_chunks keys its upsert ON model, so a model change accretes a new space
// beside the old). This deletes them, mirroring purgeMemoryVectors. The active model is roleClients.embedModel.

import { documentChunks } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { EMBED_DIM, EMBED_MODEL, makeStoreHarness, seedDocument, seedUser } from "../_support.ts";

const OLD_MODEL = "old-embed-model-v1";

describe("purgeDocumentVectors (PD-139(c))", () => {
  test("deletes only the rows outside the active embed space; the active space survives", async () => {
    const db = await freshDb();
    const svc = createEmbeddingsService(makeStoreHarness(db).ctx); // roleClients.embedModel === EMBED_MODEL
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const documentId = await seedDocument(db, owner);

    // The same chunk in the OLD space and the NEW (active) space — both coexist (model is in the upsert key).
    const fkRefs = { documentId, chunkIdx: 0, charStart: 0, charEnd: 11 };
    await svc.store({ kind: "document", lens: "chunk", content: "canon slice", model: OLD_MODEL, dim: EMBED_DIM, fkRefs });
    await svc.store({ kind: "document", lens: "chunk", content: "canon slice", model: EMBED_MODEL, dim: EMBED_DIM, fkRefs });
    expect(await db.select().from(documentChunks)).toHaveLength(2);

    const { chunks } = await svc.purgeDocumentVectors();

    expect(chunks).toBe(1); // the OLD_MODEL row reclaimed
    const rows = await db.select().from(documentChunks);
    expect(rows.map((r) => r.model)).toEqual([EMBED_MODEL]); // no strand in the retired space
  });

  test("is a no-op when every row is already in the active space", async () => {
    const db = await freshDb();
    const svc = createEmbeddingsService(makeStoreHarness(db).ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const documentId = await seedDocument(db, owner);
    await svc.store({
      kind: "document",
      lens: "chunk",
      content: "a",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
      fkRefs: { documentId, chunkIdx: 0, charStart: 0, charEnd: 1 },
    });

    const { chunks } = await svc.purgeDocumentVectors();

    expect(chunks).toBe(0);
    expect(await db.select().from(documentChunks)).toHaveLength(1);
  });
});
