// verb: clearTable — the maintenance wipe. Asserts a `DELETE FROM` empties the named table (and leaves the
// others alone — the typed VectorTable routes to exactly one table).

import { characterEmbeddings, imageEmbeddings } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { EMBED_DIM, EMBED_MODEL, IMAGE_EMBED_MODEL, makeStoreHarness, seedAsset, seedCharacter, seedUser } from "../_support.ts";

const IMG = new Uint8Array([1, 2, 3, 4]);

describe("clearTable", () => {
  test("wipes the named table and leaves the others untouched", async () => {
    const db = await freshDb();
    const h = makeStoreHarness(db);
    const svc = createEmbeddingsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const assetId = await seedAsset(db, owner);

    await svc.store({
      kind: "card",
      lens: "card-text",
      characterId,
      content: "card",
      model: EMBED_MODEL,
      dim: EMBED_DIM,
    });
    await svc.store({
      kind: "avatar",
      lens: "image-raw",
      assetId,
      content: IMG,
      model: IMAGE_EMBED_MODEL,
      dim: EMBED_DIM,
    });

    await svc.clearTable({ table: "character_embeddings" });

    expect(await db.select().from(characterEmbeddings)).toHaveLength(0);
    expect(await db.select().from(imageEmbeddings)).toHaveLength(1);
  });
});
