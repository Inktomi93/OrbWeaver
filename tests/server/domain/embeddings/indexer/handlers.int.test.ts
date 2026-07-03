// indexer/handlers — the event-driven re-embed subscriber. Load-bearing assertions:
//   • `character.updated` → re-reads the card by id (canon, not event payload) and stores a card-text vector
//     tagged with the bound embed model (roleClients.embedModel);
//   • `asset.created` → embeds BOTH image lenses (image-raw + image-captioned), generating the caption inline
//     via the injected `summarize` op, persisting it on the captioned row;
//   • a source deleted between emit and handler (loader → undefined) is a silent skip — no store, no row.

import { characterEmbeddings, imageEmbeddings } from "@orb/db";
import { createEmbeddingsIndexer, createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import {
  EMBED_MODEL,
  IMAGE_EMBED_MODEL,
  makeIndexerHarness,
  makeStoreHarness,
  seedAsset,
  seedCharacter,
  seedUser,
  TEST_CAPTION,
} from "../_support.ts";

const CARD_TEXT = "Bryn — a lighthouse keeper who collects shipwreck letters.";
const IMG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 5, 6, 7, 8]);

describe("onCharacterUpdated", () => {
  test("re-reads the card by id and stores a card-text vector in the embed space", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, owner);
    const ih = makeIndexerHarness(svc.store, storeH.roleClients, { cardText: CARD_TEXT });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onCharacterUpdated({ type: "character.updated", characterId });

    expect(ih.loadCardText).toHaveBeenCalledWith(characterId);
    expect(storeH.roleClients.embed).toHaveBeenCalledTimes(1);
    const rows = await db
      .select()
      .from(characterEmbeddings)
      .where(eq(characterEmbeddings.characterId, characterId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBe(EMBED_MODEL);
  });

  test("a deleted card (loader → undefined) is a silent skip — no store", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const characterId = await seedCharacter(db, owner);
    const ih = makeIndexerHarness(svc.store, storeH.roleClients, { cardText: undefined });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onCharacterUpdated({ type: "character.updated", characterId });

    expect(storeH.roleClients.embed).not.toHaveBeenCalled();
    expect(await db.select().from(characterEmbeddings)).toHaveLength(0);
  });
});

describe("onAssetCreated", () => {
  test("embeds both image lenses, captioning inline via summarize", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const assetId = await seedAsset(db, owner);
    const ih = makeIndexerHarness(svc.store, storeH.roleClients, { assetBytes: IMG });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onAssetCreated({ type: "asset.created", assetId });

    expect(ih.loadAssetBytes).toHaveBeenCalledWith(assetId);
    expect(storeH.roleClients.summarize).toHaveBeenCalledTimes(1);
    expect(storeH.roleClients.imageEmbed).toHaveBeenCalledTimes(2);
    const rows = await db
      .select()
      .from(imageEmbeddings)
      .where(eq(imageEmbeddings.assetId, assetId));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.model === IMAGE_EMBED_MODEL)).toBe(true);
    expect(rows.find((r) => r.lens === "image-raw")?.caption).toBeNull();
    expect(rows.find((r) => r.lens === "image-captioned")?.caption).toBe(TEST_CAPTION);
  });

  test("a deleted asset (loader → undefined) is a silent skip — no store", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const assetId = await seedAsset(db, owner);
    const ih = makeIndexerHarness(svc.store, storeH.roleClients, { assetBytes: undefined });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onAssetCreated({ type: "asset.created", assetId });

    expect(storeH.roleClients.imageEmbed).not.toHaveBeenCalled();
    expect(await db.select().from(imageEmbeddings)).toHaveLength(0);
  });
});
