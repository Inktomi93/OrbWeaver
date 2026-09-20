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

import type { ProviderId } from "@orb/contracts/inference";
import { embedGenerations, embedSpaceState, imageEmbeddings, imageIndexSkips, userConnections } from "@orb/db";
import type { AssetId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createEmbeddingsService } from "@orb/server/domain/embeddings";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { TEST_CONNECTION_ID, TEST_PROVIDER_ID } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { EMBED_DIM, EMBED_MODEL, IMAGE_EMBED_MODEL, makeStoreHarness, pngBytes, seedAsset, seedUser, TEST_CAPTION } from "../_support.ts";

const IMG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
const signal = (): AbortSignal => new AbortController().signal;

async function seedSweepConnection(db: Awaited<ReturnType<typeof freshDb>>, ownerId: UserId): Promise<void> {
  await db.insert(userConnections).values({
    id: TEST_CONNECTION_ID,
    ownerId,
    label: "image sweep vector connection",
    providerId: castId<ProviderId>(TEST_PROVIDER_ID),
    model: EMBED_MODEL,
  });
}

/** A degenerate 1×1 asset and a real 64×64 asset seeded for one owner, plus the per-asset bytes map the
 *  sweep's `loadAssetBytes` fake serves. Distinct hashes — `assets` is unique(owner, hash). */
async function seedAdmissionMix(db: Awaited<ReturnType<typeof freshDb>>): Promise<{
  owner: UserId;
  degenerate: AssetId;
  real: AssetId;
  ids: readonly AssetId[];
  bytes: ReadonlyMap<AssetId, Uint8Array>;
}> {
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  await seedSweepConnection(db, owner);
  const degenerate = await seedAsset(db, owner, { id: "asset_tiny", hash: "hash-tiny" });
  const real = await seedAsset(db, owner, { id: "asset_real", hash: "hash-real" });
  return {
    owner,
    degenerate,
    real,
    ids: [degenerate, real],
    bytes: new Map([
      [degenerate, pngBytes(1, 1)],
      [real, pngBytes(64, 64)],
    ]),
  };
}

async function seedOneAsset(db: Awaited<ReturnType<typeof freshDb>>): Promise<{
  owner: UserId;
  assetId: AssetId;
  ids: readonly AssetId[];
  bytes: ReadonlyMap<AssetId, Uint8Array>;
}> {
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  await seedSweepConnection(db, owner);
  const assetId = await seedAsset(db, owner);
  return { owner, assetId, ids: [assetId], bytes: new Map([[assetId, IMG]]) };
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

  // §10-3 + §10-5 in the sweep, in one drive: the joint-space fallback on the WRITE side, and the completion
  // mark the read side later folds. Both matter here rather than only in the on-write handler, because a
  // whole-corpus reindex is exactly when an owner's space changes — the sweep IS the reindex.
  test("§10-3/§10-5 an owner with no image embedder is swept into the TEXT space and RECORDED as complete there", async () => {
    const db = await freshDb();
    const seeded = await seedOneAsset(db);
    const h = makeStoreHarness(db, { imageAssetIds: seeded.ids, assetBytes: seeded.bytes }, "no-binding");
    const svc = createEmbeddingsService(h.ctx);

    const result = await svc.embedAssets({ ownerId: null, force: false, signal: signal() });

    // The asset is EMBEDDED, not skipped — the pre-§10-3 sweep counted it as `skipped` and moved on.
    expect(result).toEqual({ embedded: 1, skipped: 0 });
    const rows = await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, seeded.assetId));
    expect(rows.map((r) => r.lens)).toEqual(["image-captioned"]);
    expect(rows[0]?.model).toBe(EMBED_MODEL);
    expect(h.roleClients.imageEmbed).not.toHaveBeenCalled();

    // …and the sweep's terminal recorded WHERE it left this owner's images, which is what makes the read
    // side's `activeSpace` a fact about finished work rather than about a settings row.
    const state = await db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, seeded.owner));
    expect(state).toEqual([expect.objectContaining({ scope: "images" })]);
    const activeGenerationId = state[0]?.activeGenerationId;
    if (activeGenerationId === null || activeGenerationId === undefined) {
      throw new Error("the image sweep must promote an active generation");
    }
    const generation = await db.select({ space: embedGenerations.space }).from(embedGenerations).where(eq(embedGenerations.id, activeGenerationId));
    expect(generation).toEqual([{ space: EMBED_MODEL }]);
  });

  test("§10-5 the ordinary image arm records its own space — the mark follows the arm, not a constant", async () => {
    const db = await freshDb();
    const seeded = await seedOneAsset(db);
    const h = makeStoreHarness(db, { imageAssetIds: seeded.ids, assetBytes: seeded.bytes });
    const svc = createEmbeddingsService(h.ctx);

    await svc.embedAssets({ ownerId: null, force: false, signal: signal() });

    const state = await db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, seeded.owner));
    expect(state).toEqual([expect.objectContaining({ scope: "images" })]);
    const activeGenerationId = state[0]?.activeGenerationId;
    if (activeGenerationId === null || activeGenerationId === undefined) {
      throw new Error("the image sweep must promote an active generation");
    }
    const generation = await db.select({ space: embedGenerations.space }).from(embedGenerations).where(eq(embedGenerations.id, activeGenerationId));
    expect(generation).toEqual([{ space: IMAGE_EMBED_MODEL }]);
  });

  test("§10-5 an ABORTED sweep records nothing — a half-moved corpus must never read as complete", async () => {
    const db = await freshDb();
    const seeded = await seedOneAsset(db);
    const h = makeStoreHarness(db, { imageAssetIds: seeded.ids, assetBytes: seeded.bytes });
    const svc = createEmbeddingsService(h.ctx);
    const aborted = new AbortController();
    aborted.abort();

    await svc.embedAssets({ ownerId: null, force: false, signal: aborted.signal });

    // This is the whole reason the mark lives at the terminal behind the abort guard: a completion written
    // by a pass that did not finish would tell every later read that a partly-migrated corpus is settled.
    expect(await db.select().from(embedSpaceState)).toEqual([]);
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
      ownerId: seeded.owner,
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

// ── The admission floor (#273): a degenerate asset never reaches caption/embed, and its skip is RECORDED so
//    a re-index honors it rather than re-attempting it every pass (the content-hash self-heal is blind to a
//    silently-dropped asset). ──────────────────────────────────────────────────────────────────────────────
describe("embedAssets — the image admission floor", () => {
  test("a degenerate asset is SKIPPED with a recorded reason; a real asset embeds — same sweep", async () => {
    const db = await freshDb();
    const seeded = await seedAdmissionMix(db);
    const h = makeStoreHarness(db, { imageAssetIds: seeded.ids, assetBytes: seeded.bytes });
    const svc = createEmbeddingsService(h.ctx);

    const result = await svc.embedAssets({ ownerId: null, force: false, signal: signal() });

    // (a) degenerate skipped, (b) real embedded — one pass over the two.
    expect(result).toEqual({ embedded: 1, skipped: 1 });
    // The expensive calls ran for the REAL asset only (two lenses, one caption) — never for the 1×1.
    expect(h.roleClients.imageEmbed).toHaveBeenCalledTimes(2);
    expect(h.roleClients.summarize).toHaveBeenCalledTimes(1);
    // The degenerate asset wrote ZERO vectors and ONE attributable skip row (reason + the sniffed dims).
    expect(await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, seeded.degenerate))).toHaveLength(0);
    const skips = await db.select().from(imageIndexSkips).where(eq(imageIndexSkips.assetId, seeded.degenerate));
    expect(skips).toHaveLength(1);
    expect(skips[0]).toMatchObject({ reason: "below-dimension-floor", width: 1, height: 1 });
    // The real asset embedded both lenses and is NOT in the skip-log.
    expect(await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, seeded.real))).toHaveLength(2);
    expect(await db.select().from(imageIndexSkips).where(eq(imageIndexSkips.assetId, seeded.real))).toHaveLength(0);
  });

  test("(c) a re-index HONORS the record — the skipped asset is not re-attempted (no byte reload, no spend)", async () => {
    const db = await freshDb();
    const seeded = await seedAdmissionMix(db);
    const h = makeStoreHarness(db, { imageAssetIds: seeded.ids, assetBytes: seeded.bytes });
    const svc = createEmbeddingsService(h.ctx);

    await svc.embedAssets({ ownerId: null, force: false, signal: signal() });
    h.loadAssetBytes.mockClear();
    h.roleClients.imageEmbed.mockClear();
    h.roleClients.summarize.mockClear();

    const rerun = await svc.embedAssets({ ownerId: null, force: false, signal: signal() });

    expect(rerun).toEqual({ embedded: 0, skipped: 2 });
    // The record short-circuits BEFORE loadAssetBytes — proving the skip is HONORED, not merely re-derived
    // from a re-sniff (which would still load the bytes). The real asset still loads bytes for its hash gate.
    expect(h.loadAssetBytes).not.toHaveBeenCalledWith(seeded.degenerate);
    expect(h.loadAssetBytes).toHaveBeenCalledWith(seeded.real);
    // No caption/embed compute on the rerun for either asset (degenerate honored, real hash-current).
    expect(h.roleClients.imageEmbed).not.toHaveBeenCalled();
    expect(h.roleClients.summarize).not.toHaveBeenCalled();
    // Still exactly one skip row (onConflictDoNothing — the first verdict stands, no duplicate).
    expect(await db.select().from(imageIndexSkips).where(eq(imageIndexSkips.assetId, seeded.degenerate))).toHaveLength(1);
  });

  test("`force` re-admits a skipped asset (a deliberate whole re-index bypasses the recorded skip)", async () => {
    const db = await freshDb();
    const seeded = await seedAdmissionMix(db);
    const h = makeStoreHarness(db, { imageAssetIds: [seeded.degenerate], assetBytes: seeded.bytes });
    const svc = createEmbeddingsService(h.ctx);
    await svc.embedAssets({ ownerId: null, force: false, signal: signal() });
    h.loadAssetBytes.mockClear();

    // force bypasses the recorded-skip read, so the degenerate asset's bytes ARE re-loaded — but the
    // dimension gate still refuses it (the floor is not force-able; force only re-admits to the CHECK).
    await svc.embedAssets({ ownerId: null, force: true, signal: signal() });

    expect(h.loadAssetBytes).toHaveBeenCalledWith(seeded.degenerate);
    expect(h.roleClients.imageEmbed).not.toHaveBeenCalled();
    expect(await db.select().from(imageEmbeddings).where(eq(imageEmbeddings.assetId, seeded.degenerate))).toHaveLength(0);
  });
});
