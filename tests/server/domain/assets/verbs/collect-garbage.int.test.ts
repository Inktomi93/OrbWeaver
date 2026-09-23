// verb: collectGarbage — grace-windowed mark-sweep GC over the whole per-user CAS. Load-bearing assertions:
//   • an ORPHAN BLOB (blob, no row) past grace is reclaimed.
//   • an UNREFERENCED asset (row present, referenced by no registry column) past grace is reclaimed (row +
//     blob), drop-row-before-blob.
//   • a REFERENCED asset (character avatar) is KEPT even when old (liveness beats age).
//   • the GRACE WINDOW protects a recently-touched blob (mtime within grace) even when unreferenced — the
//     put→link gap guard.
//   • an ORPHAN blob that gets INDEXED between the sweep's snapshot and the purge is NOT reclaimed — the
//     `assetId: undefined` arm re-resolves owner+hash at the destructive edge, so a row committed after the
//     snapshot is never left pointing at removed bytes.
//   • `dryRun` counts what it WOULD reclaim without deleting.
//   • anti-reap: a `background` asset pinned ONLY by `appearance.backgroundAssetId` in the
//     `user_settings.config` JSON (NO FK column) is KEPT even when old — the JSON live-source scan roots it.
//     The inverse: once that pin is cleared (kind back to `none`), the now-unreferenced blob IS reaped past
//     grace — proving the scan doesn't over-retain a stale value.
// Blob mtimes are set deterministically via `utimes` (the injected clock is frozen; a fresh CAS write stamps
// the real wall clock, so the test controls mtime directly — the same lever `putBytes`' dedup bump pulls).

import { utimes } from "node:fs/promises";
import { pluginManifestSchema } from "@orb/contracts/plugin";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { assets, characters, chats, pluginAssets, plugins, userSettings } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { AssetId, CharacterHandle, ChatId, Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { recordPluginFetchedAsset } from "@orb/server/domain/plugin";
import type { Cas } from "@orb/server/infra/storage";
import { eq, sql } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb, freshHeldDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import type { AssetsHarness } from "../_support.ts";
import { makeHarness, pngBytes, principal, seedCharacter, seedUser, setCharacterAvatar } from "../_support.ts";

const PNG = "image/png";
const TWO_HOURS_MS = 2 * 3_600_000;
const MS_PER_SECOND = 1000;
const ASSET_DELETE = /^delete from "assets"/i;

/** Insert this owner's `user_settings` row with the given `appearance` overrides merged onto defaults —
 *  the JSON blob the live-source scan reads. `undefined` `assetId` leaves the pin cleared (kind
 *  `none`), modelling a removed background. */
async function seedBackgroundPin(db: Awaited<ReturnType<typeof freshDb>>, owner: UserId, assetId?: AssetId, hash?: string): Promise<void> {
  const appearance =
    assetId === undefined
      ? DEFAULT_USER_SETTINGS.appearance
      : {
          ...DEFAULT_USER_SETTINGS.appearance,
          backgroundImageKind: "asset" as const,
          backgroundAssetId: assetId,
          backgroundAssetHash: hash ?? "",
        };
  await db.insert(userSettings).values({
    userId: owner,
    config: { ...DEFAULT_USER_SETTINGS, appearance },
  });
}

/** Insert this owner's `user_settings` with a `backgroundLibrary` holding one entry for `assetId` — the
 *  BG-D library live-source. The current pick stays `none` so the ONLY liveness signal is the library entry
 *  (proving an UNPICKED upload is still rooted). An empty `entries` models a removed-from-library asset. */
async function seedBackgroundLibrary(
  db: Awaited<ReturnType<typeof freshDb>>,
  owner: UserId,
  entries: readonly { assetId: AssetId; assetHash: string }[],
): Promise<void> {
  const appearance = {
    ...DEFAULT_USER_SETTINGS.appearance,
    backgroundLibrary: entries.map((e) => ({ entryId: `entry_${e.assetId}`, assetId: e.assetId, assetHash: e.assetHash, mime: PNG, name: "bg" })),
  };
  await db.insert(userSettings).values({ userId: owner, config: { ...DEFAULT_USER_SETTINGS, appearance } });
}

/** Install one plugin for `owner` (its bundle bytes go through the real CAS store, so the row's RESTRICT FK
 *  points at a real asset) and return its id — the parent every `plugin_assets` fetch row hangs off. */
async function seedInstalledPlugin(db: Awaited<ReturnType<typeof freshDb>>, owner: UserId, svc: ReturnType<typeof createAssetsService>): Promise<PluginId> {
  const bundle = await svc.store({ principal: principal(owner), bytes: pngBytes(90), kind: "document", mime: "application/zip" });
  const id = castId<PluginId>("plugin_gcfixture0000000000000");
  const manifest = pluginManifestSchema.parse({
    id: "gc-fixture",
    name: "GC Fixture",
    version: "1.0.0",
    hostVersion: 1,
    entry: "main.js",
    description: "collect-garbage plugin-asset fixture",
    capabilities: ["net.fetch_asset"],
    netHosts: ["covers.example.invalid"],
  });
  await db.insert(plugins).values({
    id,
    ownerId: owner,
    slug: manifest.id,
    name: manifest.name,
    version: manifest.version,
    manifest,
    bundleAssetId: bundle.assetId,
    grantedCapabilities: [...manifest.capabilities],
    status: "enabled",
    origin: "upload",
    installedAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });
  return id;
}

/** Force a blob's mtime to a fixed epoch-ms (the grace check reads `cas.mtimeMs`). */
async function setBlobMtime(h: AssetsHarness, owner: UserId, hash: string, atMs: number): Promise<void> {
  const seconds = atMs / MS_PER_SECOND;
  await utimes(h.ctx.cas.blobPath(owner, hash), seconds, seconds);
}

describe("collectGarbage", () => {
  test("reclaims an orphan blob (blob, no row) past grace", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    // A blob with NO index row (the crash/DR leak shape).
    const put = await h.ctx.cas.putBytes(owner, pngBytes(1), FROZEN_AT_MS);
    await setBlobMtime(h, owner, put.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(1);
    expect(await h.ctx.cas.exists(owner, put.hash)).toBe(false);
  });

  test("reclaims an unreferenced asset (row + blob) past grace", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(2),
      kind: "avatar",
      mime: PNG,
    });
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(1);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(0);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(false);
  });

  test("keeps a referenced asset (character avatar) even when old", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(3),
      kind: "avatar",
      mime: PNG,
    });
    const character = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    await setCharacterAvatar(db, character, stored.assetId);
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(0);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("a reference created after the sweep snapshot but before deletion keeps the candidate", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await createAssetsService(h.ctx).store({ principal: principal(owner), bytes: pngBytes(31), kind: "avatar", mime: PNG });
    const character = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("late-ref") });
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);
    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const original = h.ctx.cas;
    const cas: Cas = {
      putBytes: original.putBytes.bind(original),
      blobPath: original.blobPath.bind(original),
      exists: original.exists.bind(original),
      mtimeMs: async (ownerId, hash) => {
        reached.resolve();
        await release.promise;
        return original.mtimeMs(ownerId, hash);
      },
      read: original.read.bind(original),
      verify: original.verify.bind(original),
      remove: original.remove.bind(original),
      listHashes: original.listHashes.bind(original),
      listOwners: original.listOwners.bind(original),
    };
    const collecting = createAssetsService({ ...h.ctx, cas }).collectGarbage({});
    await reached.promise;
    await setCharacterAvatar(db, character, stored.assetId);
    release.resolve();

    const result = await collecting;

    expect(result.reclaimed).toBe(0);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("an orphan blob INDEXED between the snapshot and the purge is not reclaimed", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    // A pure orphan: bytes on disk, no index row, past grace — the sweep's `assetId: undefined` arm.
    const bytes = pngBytes(33);
    const put = await h.ctx.cas.putBytes(owner, bytes, FROZEN_AT_MS);
    await setBlobMtime(h, owner, put.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const reached = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const original = h.ctx.cas;
    const cas: Cas = {
      putBytes: original.putBytes.bind(original),
      blobPath: original.blobPath.bind(original),
      exists: original.exists.bind(original),
      // Pause AFTER the grace stat: the mtime this sweep judges by was read BEFORE the concurrent store —
      // exactly the real race (a `putBytes` mtime bump the sweep can no longer see).
      mtimeMs: async (ownerId, hash) => {
        const mtime = await original.mtimeMs(ownerId, hash);
        reached.resolve();
        await release.promise;
        return mtime;
      },
      read: original.read.bind(original),
      verify: original.verify.bind(original),
      remove: original.remove.bind(original),
      listHashes: original.listHashes.bind(original),
      listOwners: original.listOwners.bind(original),
    };
    const collecting = createAssetsService({ ...h.ctx, cas }).collectGarbage({});
    await reached.promise;
    // The transition the snapshot cannot see: a store dedups onto these bytes and INDEXES them.
    const stored = await createAssetsService(h.ctx).store({ principal: principal(owner), bytes, kind: "avatar", mime: PNG });
    release.resolve();

    const result = await collecting;

    expect(result.reclaimed).toBe(0);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    // The row must never be left pointing at bytes the sweep removed.
    expect(await h.ctx.cas.exists(owner, put.hash)).toBe(true);
  });

  test("a reference committed while the guarded asset-row DELETE is held wins the destructive edge", async () => {
    const { db, hold } = await freshHeldDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await createAssetsService(h.ctx).store({ principal: principal(owner), bytes: pngBytes(32), kind: "background", mime: PNG });
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);
    const deletion = hold(ASSET_DELETE);
    const collecting = createAssetsService(h.ctx).collectGarbage({});
    await deletion.reached;
    await seedBackgroundPin(db, owner, stored.assetId, stored.hash);
    deletion.release();

    const result = await collecting;

    expect(result.reclaimed).toBe(0);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("grace window protects a recently-touched unreferenced blob", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(4),
      kind: "avatar",
      mime: PNG,
    });
    // mtime == now ⇒ within any positive grace ⇒ skipped (the put→link gap guard).
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(0);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
  });

  test("dryRun counts what it would reclaim without deleting", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(5),
      kind: "avatar",
      mime: PNG,
    });
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({ dryRun: true });

    expect(result).toEqual({ scanned: 1, reclaimed: 1, dryRun: true });
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("keeps a background asset pinned only in appearance JSON, even when old (anti-reap)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(6),
      kind: "background",
      mime: PNG,
    });
    // No FK column references it — the ONLY liveness signal is the JSON pin in user_settings.config.
    await seedBackgroundPin(db, owner, stored.assetId, stored.hash);
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(0);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("keeps a card-carried background asset pinned only by characters.background_override, even when old (BG-C anti-reap)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(11), kind: "background", mime: PNG });
    // The ONLY liveness signal is the JSON background_override column on the character card.
    const characterId = await seedCharacter(db, owner);
    await db
      .update(characters)
      .set({
        backgroundOverride: { kind: "asset", externalUrl: "", assetId: stored.assetId, assetHash: stored.hash, mime: PNG, provenanceUrl: "" },
      })
      .where(eq(characters.id, characterId));
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(0);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("keeps a host-set chat background asset pinned only by chats.metadata.background, even when old (BG-C anti-reap)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(12), kind: "background", mime: PNG });
    // The ONLY liveness signal is the JSON metadata.background sub-blob on the chat row.
    await db.insert(chats).values({
      id: castId<ChatId>("chat_bgc"),
      metadata: { background: { kind: "asset", externalUrl: "", assetId: stored.assetId, assetHash: stored.hash, mime: PNG, provenanceUrl: "" } },
      createdAt: FROZEN_AT_MS,
      updatedAt: FROZEN_AT_MS,
    });
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(0);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("keeps a background-library asset that is NOT the current pick, even when old (BG-D anti-reap)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(8),
      kind: "background",
      mime: PNG,
    });
    // Current pick is `none`; the ONLY liveness signal is the library entry — an unpicked upload must survive.
    await seedBackgroundLibrary(db, owner, [{ assetId: stored.assetId, assetHash: stored.hash }]);
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(0);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("reaps a background asset once removed from the library, past grace (no over-retention)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(9),
      kind: "background",
      mime: PNG,
    });
    // Removed from the library (empty array) and never the current pick — nothing references the blob now.
    await seedBackgroundLibrary(db, owner, []);
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(1);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(0);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(false);
  });

  test("reaps a background asset once its appearance pin is cleared, past grace (no over-retention)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(7),
      kind: "background",
      mime: PNG,
    });
    // The user cleared their background (kind back to `none`, no assetId) — nothing references the blob now.
    await seedBackgroundPin(db, owner);
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(1);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(0);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(false);
  });

  test("does NOT root a smuggled chat background — kind:none carrying an assetId is reaped past grace (F2b kind guard)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(13), kind: "background", mime: PNG });
    // A hand-crafted / pre-canonicalization row: `kind:"none"` but carrying a populated `assetId`. The GC scan's
    // kind guard must NOT root it — nothing legitimately references the blob, so it is reaped past grace.
    await db.insert(chats).values({
      id: castId<ChatId>("chat_smuggle"),
      metadata: { background: { kind: "none", externalUrl: "", assetId: stored.assetId, assetHash: stored.hash, mime: PNG, provenanceUrl: "" } },
      createdAt: FROZEN_AT_MS,
      updatedAt: FROZEN_AT_MS,
    });
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(1);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(0);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(false);
  });

  test("does NOT root a smuggled card background_override — kind:none carrying an assetId is reaped past grace (F2b kind guard)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(14), kind: "background", mime: PNG });
    const characterId = await seedCharacter(db, owner);
    await db
      .update(characters)
      .set({
        backgroundOverride: { kind: "none", externalUrl: "", assetId: stored.assetId, assetHash: stored.hash, mime: PNG, provenanceUrl: "" },
      })
      .where(eq(characters.id, characterId));
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(1);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(0);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(false);
  });

  // #757 — a corrupt (present but unreadable) appearance.backgroundLibrary must NOT be read as "no library",
  // because that under-inclusion feeds the live-reference set collectGarbage sweeps against: an empty read
  // would authorize reaping an asset the corrupt library still (unreadably) points at. Both arms seed a blob
  // that is old enough and unreferenced by any OTHER live-source, so a wrongly-permissive read would reap it
  // — the surviving row + blob is the proof the rejection landed BEFORE any destructive sweep, not just that
  // something threw.
  test("rejects the sweep (does not reap) when backgroundLibrary is present but not valid JSON (#757)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(21), kind: "background", mime: PNG });
    // Seed a normal (parseable) library row first, then corrupt it past the type system — mirroring the
    // regex-scripts precedent (queries.int.test.ts) for "a row a hand-edit / bug wrote, not the app".
    await seedBackgroundLibrary(db, owner, [{ assetId: stored.assetId, assetHash: stored.hash }]);
    await db.run(sql`update user_settings set config = json_set(config, '$.appearance.backgroundLibrary', '{not json') where user_id = ${owner}`);
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    await expect(svc.collectGarbage({})).rejects.toBeInstanceOf(DomainOperationError);

    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("rejects the sweep (does not reap) when backgroundLibrary is present but not an array (#757)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(22), kind: "background", mime: PNG });
    await seedBackgroundLibrary(db, owner, [{ assetId: stored.assetId, assetHash: stored.hash }]);
    // Valid JSON, but the wrong shape — an object instead of an array.
    await db.run(
      sql`update user_settings set config = json_set(config, '$.appearance.backgroundLibrary', json('{"assetId":"not-an-array"}')) where user_id = ${owner}`,
    );
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    await expect(svc.collectGarbage({})).rejects.toBeInstanceOf(DomainOperationError);

    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  // #802 — a `net.fetchAsset` cover has NO other referencing row anywhere (the surface that displays it is a
  // plugin UI state blob, which is JSON and invisible to the FK enumeration), so before the `plugin_assets`
  // link existed this asset was reaped one grace window after the fetch and a live hub cover 404'd. RED on the
  // unmodified source: the row and the blob were both gone here.
  test("keeps a plugin-fetched asset while its plugin is installed, even when old (#802 anti-reap)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const pluginId = await seedInstalledPlugin(db, owner, svc);
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(41), kind: "generated", mime: PNG });
    // The ONLY liveness signal is the fetch link the `storeFetched` host op writes.
    await recordPluginFetchedAsset(db, pluginId, stored.assetId, FROZEN_AT_MS);
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
    expect(result.reclaimed).toBe(0);
  });

  // The other direction — the planted control for the arm above. Retention is bounded by the INSTALL: once the
  // plugin row goes, its links CASCADE and the covers are ordinary candidates again (this is what the scheduled
  // sweep does; `uninstall` also reaps them eagerly — `uninstall.int.test.ts`).
  test("reaps a plugin-fetched asset once the plugin is uninstalled (the link CASCADEs), past grace", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const pluginId = await seedInstalledPlugin(db, owner, svc);
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(42), kind: "generated", mime: PNG });
    await recordPluginFetchedAsset(db, pluginId, stored.assetId, FROZEN_AT_MS);
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);
    // Uninstall: the row goes and the FK CASCADE takes the fetch link with it.
    await db.delete(plugins).where(eq(plugins.id, pluginId));
    expect(await db.select().from(pluginAssets).where(eq(pluginAssets.pluginId, pluginId))).toEqual([]);

    const result = await svc.collectGarbage({});

    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(0);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(false);
    expect(result.reclaimed).toBeGreaterThanOrEqual(1);
  });

  test("still reaps normally when backgroundLibrary is genuinely absent (no regression from the fail-closed change)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(23), kind: "background", mime: PNG });
    // No user_settings row at all — the documented no-settings-yet state.
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(1);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(0);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(false);
  });
});
