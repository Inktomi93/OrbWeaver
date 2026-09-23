// verb: purgeDocumentVectors — the databank arm of the old-space reclaim. After a BULK
// databank-reindex re-embeds every document chunk into the box's active embed (model) space, rows left in any
// OTHER space are stranded (document_chunks keys its upsert ON model, so a model change accretes a new space
// beside the old). This deletes them, mirroring purgeMemoryVectors. The active model is roleClients.embedModel.

import { documentChunks } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { EMBED_DIM, EMBED_MODEL, embedAs, makeStoreHarness, seedDocument, seedUser } from "../_support.ts";

const OLD_MODEL = "old-embed-model-v1";

describe("purgeDocumentVectors", () => {
  test("retains the previous document corpus until the other embed scopes complete", async () => {
    const db = await freshDb();
    const harness = makeStoreHarness(db); // roleClients.embedModel === EMBED_MODEL
    const svc = createEmbeddingsService(harness.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const documentId = await seedDocument(db, owner);

    // The same chunk in the OLD space and the NEW (active) space — both coexist (model is in the upsert key).
    // The old-space row is created the way a REAL strand is: the provider reported the retired model when
    // that row was written. Declaring `model: OLD_MODEL` in the params no longer does it — since 0fed0b3ee
    // the column records what the provider returned, which is the whole point of that fix.
    const fkRefs = { documentId, chunkIdx: 0, charStart: 0, charEnd: 11 };
    embedAs(harness, OLD_MODEL);
    await svc.store({ kind: "document", lens: "chunk", content: "canon slice", model: OLD_MODEL, dim: EMBED_DIM, fkRefs, ownerId: owner });
    embedAs(harness, EMBED_MODEL);
    await svc.store({ kind: "document", lens: "chunk", content: "canon slice", model: EMBED_MODEL, dim: EMBED_DIM, fkRefs, ownerId: owner });
    expect(await db.select().from(documentChunks)).toHaveLength(1);

    const generation = await svc.resolveGeneration(owner, "embed");
    if (generation === null) {
      throw new Error("expected generation");
    }
    const { chunks } = await svc.purgeDocumentVectors({ ownerId: owner, generation });

    expect(chunks).toBe(0);
    const rows = await db.select().from(documentChunks);
    expect(rows.map((r) => r.model)).toEqual([OLD_MODEL]);
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
      ownerId: owner,
    });

    const generation = await svc.resolveGeneration(owner, "embed");
    if (generation === null) {
      throw new Error("expected generation");
    }
    const { chunks } = await svc.purgeDocumentVectors({ ownerId: owner, generation });

    expect(chunks).toBe(0);
    expect(await db.select().from(documentChunks)).toHaveLength(1);
  });
});
