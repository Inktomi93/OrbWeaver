// verb: embedAssets — the PD-53 bulk IMAGE catch-up sweep. Load-bearing assertions:
//   • a fresh sweep embeds BOTH lenses per asset (raw + captioned rows land; ONE summarize per asset);
//   • RESUMABILITY + the caption ECONOMY: a rerun's hash pre-check skips a current asset BEFORE the
//     expensive summarize/imageEmbed calls ever run (zero extra role calls — the whole point of the
//     pre-check living in the verb, ahead of store's internal gate);
//   • `force` bypasses the pre-check AND the store gate (re-embeds + re-captions);
//   • a HALF-embedded asset (raw row present, captioned missing — a prior mid-asset failure) is resumed,
//     not skipped: the stale-half check sees through the raw row's current hash;
//   • a vanished asset row is a skip, not an error;
//   • cooperative abort: an aborted signal does no work.

import { imageEmbeddings } from "@orb/db";
import type { AssetId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { EMBED_DIM, IMAGE_EMBED_MODEL, makeStoreHarness, seedAsset, seedUser, TEST_CAPTION } from "../_support.ts";

const IMG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const signal = (): AbortSignal => new AbortController().signal;

async function seedOneAsset(db: Awaited<ReturnType<typeof freshDb>>): Promise<{
  assetId: AssetId;
  ids: readonly AssetId[];
  bytes: ReadonlyMap<AssetId, Uint8Array>;
}> {
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const assetId = await seedAsset(db, owner);
  return { assetId, ids: [assetId], bytes: new Map([[assetId, IMG]]) };
}

describe("embedAssets — the bulk image sweep", () => {
  test("a fresh sweep embeds BOTH lenses per asset with one caption call", async () => {
    const db = await freshDb();
    const seeded = await seedOneAsset(db);
    const h = makeStoreHarness(db, { imageAssetIds: seeded.ids, assetBytes: seeded.bytes });
    const svc = createEmbeddingsService(h.ctx);

    const result = await svc.embedAssets({ ownerId: null, force: false, signal: signal() });

    expect(result).toEqual({ embedded: 1, skipped: 0 });
    expect(h.roleClients.imageEmbed).toHaveBeenCalledTimes(2);
    expect(h.roleClients.summarize).toHaveBeenCalledTimes(1);
    const rows = await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, seeded.assetId));
    expect(rows.map((r) => r.lens).sort()).toEqual(["image-captioned", "image-raw"]);
    expect(rows.find((r) => r.lens === "image-captioned")?.caption).toBe(TEST_CAPTION);
    // The SAME call also produced the structured breakdown (issue #164) — a caption without facets is the
    // state the whole visual-families pipeline starved on.
    expect(rows.find((r) => r.lens === "image-captioned")?.captionMeta).toMatchObject({ artStyle: "anime", palette: "warm", mood: "cheerful" });
  });

  // ── issue #164: the facet backfill's run door ──────────────────────────────────────────────────────
  test("A CAPTIONED-BUT-UNANALYSED ROW IS WORK, not a skip — the backfill is resumable without `force`", async () => {
    // The 2026-08-18 boundary in one test. Every pre-existing captioned row carries the bytes' hash and a
    // `caption_meta` of `{model}` only. A hash-ONLY currency test declares all of them current, so
    // `index {source:"image"}` skips the entire corpus and the facet columns stay empty forever — the only
    // way through would be `force`, which needlessly re-embeds both lenses for every asset on the box.
    const db = await freshDb();
    const seeded = await seedOneAsset(db);
    const h = makeStoreHarness(db, { imageAssetIds: seeded.ids, assetBytes: seeded.bytes });
    const svc = createEmbeddingsService(h.ctx);
    await svc.embedAssets({ ownerId: null, force: false, signal: signal() });
    // Roll the captioned row back to the pre-breakdown shape, exactly as it exists on the live box.
    await db
      .update(imageEmbeddings)
      .set({ captionMeta: { model: "qwen3-summarize-test" } })
      .where(eq(imageEmbeddings.lens, "image-captioned"));
    h.roleClients.summarize.mockClear();

    const rerun = await svc.embedAssets({ ownerId: null, force: false, signal: signal() });

    expect(rerun).toEqual({ embedded: 1, skipped: 0 });
    expect(h.roleClients.summarize).toHaveBeenCalledTimes(1);
    const captioned = await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.lens, "image-captioned"));
    expect(captioned).toHaveLength(1);
    expect(captioned[0]?.captionMeta).toMatchObject({ artStyle: "anime" });
  });

  test("…and once analysed it skips again — the backlog drains rather than looping", async () => {
    const db = await freshDb();
    const seeded = await seedOneAsset(db);
    const h = makeStoreHarness(db, { imageAssetIds: seeded.ids, assetBytes: seeded.bytes });
    const svc = createEmbeddingsService(h.ctx);
    await svc.embedAssets({ ownerId: null, force: false, signal: signal() });
    h.roleClients.summarize.mockClear();

    expect(await svc.embedAssets({ ownerId: null, force: false, signal: signal() })).toEqual({ embedded: 0, skipped: 1 });
    expect(h.roleClients.summarize).not.toHaveBeenCalled();
  });

  test("the sweep reports N-of-M positions (issue #166 rider 3)", async () => {
    const db = await freshDb();
    const seeded = await seedOneAsset(db);
    const h = makeStoreHarness(db, { imageAssetIds: seeded.ids, assetBytes: seeded.bytes });
    const svc = createEmbeddingsService(h.ctx);
    const positions: [number, number][] = [];

    await svc.embedAssets({ ownerId: null, force: false, signal: signal(), onProgress: (done, total) => positions.push([done, total]) });

    expect(positions).toEqual([[1, 1]]);
  });

  test("RESUMABLE + caption economy: a rerun skips BEFORE the summarize/imageEmbed calls", async () => {
    const db = await freshDb();
    const seeded = await seedOneAsset(db);
    const h = makeStoreHarness(db, { imageAssetIds: seeded.ids, assetBytes: seeded.bytes });
    const svc = createEmbeddingsService(h.ctx);

    await svc.embedAssets({ ownerId: null, force: false, signal: signal() });
    const rerun = await svc.embedAssets({ ownerId: null, force: false, signal: signal() });

    expect(rerun).toEqual({ embedded: 0, skipped: 1 });
    // The verb's hash pre-check short-circuited — the first sweep's calls are still the only ones.
    expect(h.roleClients.imageEmbed).toHaveBeenCalledTimes(2);
    expect(h.roleClients.summarize).toHaveBeenCalledTimes(1);
  });

  test("force re-embeds + re-captions matched assets — still one row per lens", async () => {
    const db = await freshDb();
    const seeded = await seedOneAsset(db);
    const h = makeStoreHarness(db, { imageAssetIds: seeded.ids, assetBytes: seeded.bytes });
    const svc = createEmbeddingsService(h.ctx);

    await svc.embedAssets({ ownerId: null, force: false, signal: signal() });
    const forced = await svc.embedAssets({ ownerId: null, force: true, signal: signal() });

    expect(forced).toEqual({ embedded: 1, skipped: 0 });
    expect(h.roleClients.imageEmbed).toHaveBeenCalledTimes(4);
    expect(h.roleClients.summarize).toHaveBeenCalledTimes(2);
    expect(await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, seeded.assetId))).toHaveLength(2);
  });

  test("a HALF-embedded asset (raw only) is resumed, not skipped", async () => {
    const db = await freshDb();
    const seeded = await seedOneAsset(db);
    const h = makeStoreHarness(db, { imageAssetIds: seeded.ids, assetBytes: seeded.bytes });
    const svc = createEmbeddingsService(h.ctx);
    // Simulate a prior run that died after the raw lens landed (before the caption/captioned store).
    await svc.store({
      kind: "avatar",
      lens: "image-raw",
      assetId: seeded.assetId,
      content: IMG,
      model: IMAGE_EMBED_MODEL,
      dim: EMBED_DIM,
    });

    const result = await svc.embedAssets({ ownerId: null, force: false, signal: signal() });

    expect(result).toEqual({ embedded: 1, skipped: 0 });
    // Raw was current (store's internal gate noops it); the captioned half was built.
    expect(h.roleClients.summarize).toHaveBeenCalledTimes(1);
    expect(await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, seeded.assetId))).toHaveLength(2);
  });

  test("a vanished asset row is a skip, not an error", async () => {
    const db = await freshDb();
    const seeded = await seedOneAsset(db);
    // Enumerated, but the bytes read resolves nothing (deleted mid-sweep).
    const h = makeStoreHarness(db, { imageAssetIds: seeded.ids });
    const svc = createEmbeddingsService(h.ctx);

    const result = await svc.embedAssets({ ownerId: null, force: false, signal: signal() });

    expect(result).toEqual({ embedded: 0, skipped: 1 });
    expect(h.roleClients.imageEmbed).not.toHaveBeenCalled();
    expect(h.roleClients.summarize).not.toHaveBeenCalled();
  });

  test("cooperative abort: an already-aborted signal does no work", async () => {
    const db = await freshDb();
    const seeded = await seedOneAsset(db);
    const h = makeStoreHarness(db, { imageAssetIds: seeded.ids, assetBytes: seeded.bytes });
    const svc = createEmbeddingsService(h.ctx);
    const controller = new AbortController();
    controller.abort();

    const result = await svc.embedAssets({
      ownerId: null,
      force: false,
      signal: controller.signal,
    });

    expect(result).toEqual({ embedded: 0, skipped: 0 });
    expect(h.loadAssetBytes).not.toHaveBeenCalled();
    expect(h.roleClients.imageEmbed).not.toHaveBeenCalled();
  });
});
