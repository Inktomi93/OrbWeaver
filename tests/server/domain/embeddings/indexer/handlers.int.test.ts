// indexer/handlers — the event-driven re-embed subscriber. Load-bearing assertions:
//   • `character.updated` → re-reads the card by id (canon, not event payload) and stores a card-text vector
//     tagged with the bound embed model (roleClients.embedModel);
//   • `asset.created` → embeds BOTH image lenses (image-raw + image-captioned), generating the caption inline
//     via the injected `summarize` op, persisting it on the captioned row;
//   • a source deleted between emit and handler (loader → undefined) is a silent skip — no store, no row.

import { characterEmbeddings, imageEmbeddings, imageIndexSkips } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsIndexer, createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import {
  EMBED_MODEL,
  IMAGE_EMBED_MODEL,
  makeIndexerHarness,
  makeStoreHarness,
  pngBytes,
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
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const ih = makeIndexerHarness(db, svc.store, storeH.roleClients, { cardText: CARD_TEXT });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onCharacterUpdated({
      type: "character.updated",
      characterId,
      contentChanged: true,
    });

    expect(ih.loadCardText).toHaveBeenCalledWith(characterId);
    expect(storeH.roleClients.embed).toHaveBeenCalledTimes(1);
    const rows = await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.model).toBe(EMBED_MODEL);
  });

  test("a deleted card (loader → undefined) is a silent skip — no store", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const ih = makeIndexerHarness(db, svc.store, storeH.roleClients, { cardText: undefined });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onCharacterUpdated({
      type: "character.updated",
      characterId,
      contentChanged: true,
    });

    expect(storeH.roleClients.embed).not.toHaveBeenCalled();
    expect(await db.select().from(characterEmbeddings)).toHaveLength(0);
  });
});

describe("onCharacterUpdated — a flag edit triggers ZERO embed work (owner ruling)", () => {
  // Belt 1 (the emit-site discriminator): `character.updated` fires on EVERY card write, but the emit site
  // stamps `contentChanged`. A star/archive/theme toggle is contentChanged=false → the indexer skips ENTIRELY,
  // NEVER reading canon or touching the store — so a never-embedded card that gets starred does NOT drag in the
  // embed backend (and its model-load crash window). Backfill belongs to content events + the bulk sweep.
  test("a flag-only edit (contentChanged=false) never embeds — even a NEVER-embedded card", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const ih = makeIndexerHarness(db, svc.store, storeH.roleClients, { cardText: CARD_TEXT });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onCharacterUpdated({
      type: "character.updated",
      characterId,
      contentChanged: false,
    });

    // Zero embed AND zero canon read (the skip is BEFORE loadCardText) AND no vector row.
    expect(storeH.roleClients.embed).not.toHaveBeenCalled();
    expect(ih.loadCardText).not.toHaveBeenCalled();
    expect(await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId))).toHaveLength(0);
  });

  test("a content edit (contentChanged=true) embeds a NEVER-embedded card", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const ih = makeIndexerHarness(db, svc.store, storeH.roleClients, { cardText: CARD_TEXT });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onCharacterUpdated({
      type: "character.updated",
      characterId,
      contentChanged: true,
    });

    expect(storeH.roleClients.embed).toHaveBeenCalledTimes(1);
    expect(await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId))).toHaveLength(1);
  });

  // Belt 2 (the store content-hash gate): even for a content event, an UNCHANGED projected embed text (a
  // duplicate delivery, or a field edit that doesn't alter the card-text projection) short-circuits to noop.
  test("a content re-fire with identical embed text does not re-embed (store gate)", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const ih = makeIndexerHarness(db, svc.store, storeH.roleClients, { cardText: CARD_TEXT });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    const event = { type: "character.updated", characterId, contentChanged: true } as const;
    await indexer.onCharacterUpdated(event);
    await indexer.onCharacterUpdated(event);

    expect(storeH.roleClients.embed).toHaveBeenCalledTimes(1);
  });

  test("a content edit that changes the card text DOES re-embed once more", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const characterId = await seedCharacter(db, owner);
    const ih = makeIndexerHarness(db, svc.store, storeH.roleClients, { cardText: CARD_TEXT });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onCharacterUpdated({
      type: "character.updated",
      characterId,
      contentChanged: true,
    });
    // A real content write changes the projected embed text → the store gate does NOT short-circuit.
    ih.loadCardText.mockResolvedValue("Bryn — now a retired cartographer who forgets the sea.");
    await indexer.onCharacterUpdated({
      type: "character.updated",
      characterId,
      contentChanged: true,
    });

    expect(storeH.roleClients.embed).toHaveBeenCalledTimes(2);
    // Still one row per (character, model) — the second embed UPSERTs the vector, it does not duplicate.
    expect(await db.select().from(characterEmbeddings).where(eq(characterEmbeddings.characterId, characterId))).toHaveLength(1);
  });
});

describe("onAssetCreated", () => {
  test("embeds both image lenses, captioning inline via summarize", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const assetId = await seedAsset(db, owner);
    const ih = makeIndexerHarness(db, svc.store, storeH.roleClients, { assetBytes: IMG });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onAssetCreated({ type: "asset.created", assetId });

    expect(ih.loadAssetBytes).toHaveBeenCalledWith(assetId);
    expect(storeH.roleClients.summarize).toHaveBeenCalledTimes(1);
    expect(storeH.roleClients.imageEmbed).toHaveBeenCalledTimes(2);
    const rows = await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, assetId));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.model === IMAGE_EMBED_MODEL)).toBe(true);
    expect(rows.find((r) => r.lens === "image-raw")?.caption).toBeNull();
    expect(rows.find((r) => r.lens === "image-captioned")?.caption).toBe(TEST_CAPTION);
  });

  // §10-3 — THE DEFECT THIS REPLACES, stated as what a user lost: an owner with no `imageEmbed` binding had
  // every image DROPPED here behind `getLog().debug(...)`. Zero rows, zero errors, and their pictures were
  // permanently unsearchable with nothing anywhere saying so. The fallback embeds the VL caption as TEXT
  // into their `embed` space, so a text query reaches the picture — one lens instead of two, which is a
  // degrade, not a silence.
  test("§10-3 NO imageEmbed binding → the caption lands in the TEXT space instead of the asset being dropped", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db, {}, "no-binding");
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner-no-image-embed") });
    const assetId = await seedAsset(db, owner);
    const ih = makeIndexerHarness(db, svc.store, storeH.roleClients, { assetBytes: IMG });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onAssetCreated({ type: "asset.created", assetId });

    // The picture IS indexed — the whole point. One row, the captioned lens, in the owner's TEXT space.
    const rows = await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, assetId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lens).toBe("image-captioned");
    expect(rows[0]?.model).toBe(EMBED_MODEL);
    expect(rows[0]?.caption).toBe(TEST_CAPTION);
    // The caption still costs its one vision call, and the image embedder is never asked (there is none).
    expect(storeH.roleClients.summarize).toHaveBeenCalledTimes(1);
    expect(storeH.roleClients.imageEmbed).not.toHaveBeenCalled();
    expect(storeH.roleClients.embed).toHaveBeenCalledWith(TEST_CAPTION);
  });

  // The second cause, and the one a bare "is the slot filled?" check cannot see: the binding EXISTS and
  // resolves, and the model still declares no image input. `canEmbedImages` is the read that separates them.
  test("§10-3 a BOUND imageEmbed model that takes no image input degrades the same way", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db, {}, "no-image-input");
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner-text-only-embedder") });
    const assetId = await seedAsset(db, owner);
    const ih = makeIndexerHarness(db, svc.store, storeH.roleClients, { assetBytes: IMG });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onAssetCreated({ type: "asset.created", assetId });

    const rows = await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, assetId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.lens).toBe("image-captioned");
    expect(rows[0]?.model).toBe(EMBED_MODEL);
    expect(storeH.roleClients.imageEmbed).not.toHaveBeenCalled();
  });

  test("a deleted asset (loader → undefined) is a silent skip — no store", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const assetId = await seedAsset(db, owner);
    const ih = makeIndexerHarness(db, svc.store, storeH.roleClients, { assetBytes: undefined });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onAssetCreated({ type: "asset.created", assetId });

    expect(storeH.roleClients.imageEmbed).not.toHaveBeenCalled();
    expect(await db.select().from(imageEmbeddings)).toHaveLength(0);
  });

  // The embeddability gate (BG-V): a `video/*` background emits `asset.created` like any asset, but the
  // imageEmbed role only speaks images. The gate keys on the STORED MIME (not AssetKind) — a video is
  // skipped BEFORE its bytes are ever loaded (no wasted decode, no failing model call). Asserted at the
  // enqueue seam: zero imageEmbed calls, zero summarize (caption), zero vector rows, and NO byte load.
  test("a video asset (video/mp4) is NOT image-embedded — skipped before loading bytes", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const assetId = await seedAsset(db, owner);
    const ih = makeIndexerHarness(db, svc.store, storeH.roleClients, { assetMime: "video/mp4", assetBytes: IMG });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onAssetCreated({ type: "asset.created", assetId });

    expect(ih.loadAssetMime).toHaveBeenCalledWith(assetId);
    expect(ih.loadAssetBytes).not.toHaveBeenCalled();
    expect(storeH.roleClients.imageEmbed).not.toHaveBeenCalled();
    expect(storeH.roleClients.summarize).not.toHaveBeenCalled();
    expect(await db.select().from(imageEmbeddings)).toHaveLength(0);
  });

  // Regression pin: a background-KIND asset that IS an image (image/png) keeps embedding exactly as before —
  // the gate's axis is embeddability (mime), never AssetKind.
  test("an image asset (image/png) still embeds both lenses — the gate is mime, not kind", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const assetId = await seedAsset(db, owner);
    const ih = makeIndexerHarness(db, svc.store, storeH.roleClients, { assetMime: "image/png", assetBytes: IMG });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onAssetCreated({ type: "asset.created", assetId });

    expect(ih.loadAssetBytes).toHaveBeenCalledWith(assetId);
    expect(storeH.roleClients.imageEmbed).toHaveBeenCalledTimes(2);
    expect(await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, assetId))).toHaveLength(2);
  });

  // The admission floor on the ON-WRITE path (#273): a 1×1 asset carries no visual signal, so `asset.created`
  // must NOT caption or embed it — it records an attributable skip and stops before any model spend, so the
  // vector store + discovery substrate never gain a degenerate row.
  test("a degenerate (1×1) asset records a skip and is NEVER captioned/embedded", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const assetId = await seedAsset(db, owner);
    const ih = makeIndexerHarness(db, svc.store, storeH.roleClients, { assetBytes: pngBytes(1, 1) });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onAssetCreated({ type: "asset.created", assetId });

    expect(storeH.roleClients.imageEmbed).not.toHaveBeenCalled();
    expect(storeH.roleClients.summarize).not.toHaveBeenCalled();
    expect(await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, assetId))).toHaveLength(0);
    const skips = await db.select().from(imageIndexSkips).where(eq(imageIndexSkips.assetId, assetId));
    expect(skips).toHaveLength(1);
    expect(skips[0]).toMatchObject({ reason: "below-dimension-floor", width: 1, height: 1 });
  });

  // A real avatar keeps embedding exactly as before — the floor only refuses the degenerate case.
  test("a real (64×64) asset passes the floor and embeds both lenses", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const assetId = await seedAsset(db, owner);
    const ih = makeIndexerHarness(db, svc.store, storeH.roleClients, { assetBytes: pngBytes(64, 64) });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onAssetCreated({ type: "asset.created", assetId });

    expect(storeH.roleClients.imageEmbed).toHaveBeenCalledTimes(2);
    expect(await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, assetId))).toHaveLength(2);
    expect(await db.select().from(imageIndexSkips).where(eq(imageIndexSkips.assetId, assetId))).toHaveLength(0);
  });

  // A duplicate delivery of an already-skipped asset is HONORED — the record short-circuits before the bytes
  // are even re-loaded, so a re-fired event never re-attempts a known-degenerate asset.
  test("a re-fired event for a skipped asset is honored — no byte reload, no spend", async () => {
    const db = await freshDb();
    const storeH = makeStoreHarness(db);
    const svc = createEmbeddingsService(storeH.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const assetId = await seedAsset(db, owner);
    const ih = makeIndexerHarness(db, svc.store, storeH.roleClients, { assetBytes: pngBytes(1, 1) });
    const indexer = createEmbeddingsIndexer(ih.ctx);

    await indexer.onAssetCreated({ type: "asset.created", assetId });
    ih.loadAssetBytes.mockClear();

    await indexer.onAssetCreated({ type: "asset.created", assetId });

    expect(ih.loadAssetBytes).not.toHaveBeenCalled();
    expect(storeH.roleClients.imageEmbed).not.toHaveBeenCalled();
    expect(await db.select().from(imageIndexSkips).where(eq(imageIndexSkips.assetId, assetId))).toHaveLength(1);
  });
});
