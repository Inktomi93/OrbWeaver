// verb: collectGarbage — grace-windowed mark-sweep GC over the whole per-user CAS. Load-bearing assertions:
//   • an ORPHAN BLOB (blob, no row) past grace is reclaimed.
//   • an UNREFERENCED asset (row present, referenced by no registry column) past grace is reclaimed (row +
//     blob), drop-row-before-blob.
//   • a REFERENCED asset (character avatar) is KEPT even when old (liveness beats age).
//   • the GRACE WINDOW protects a recently-touched blob (mtime within grace) even when unreferenced — the
//     put→link gap guard.
//   • `dryRun` counts what it WOULD reclaim without deleting.
//   • PD-131 anti-reap: a `background` asset pinned ONLY by `appearance.backgroundAssetId` in the
//     `user_settings.config` JSON (NO FK column) is KEPT even when old — the JSON live-source scan roots it.
//     The inverse: once that pin is cleared (kind back to `none`), the now-unreferenced blob IS reaped past
//     grace — proving the scan doesn't over-retain a stale value.
// Blob mtimes are set deterministically via `utimes` (the injected clock is frozen; a fresh CAS write stamps
// the real wall clock, so the test controls mtime directly — the same lever `putBytes`' dedup bump pulls).

import { utimes } from "node:fs/promises";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { assets, characters, chats, userSettings } from "@orb/db";
import type { AssetId, ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import type { AssetsHarness } from "../_support.ts";
import { makeHarness, pngBytes, principal, seedCharacter, seedUser, setCharacterAvatar } from "../_support.ts";

const PNG = "image/png";
const TWO_HOURS_MS = 2 * 3_600_000;
const MS_PER_SECOND = 1000;

/** Insert this owner's `user_settings` row with the given `appearance` overrides merged onto defaults —
 *  the JSON blob the PD-131 live-source scan reads. `undefined` `assetId` leaves the pin cleared (kind
 *  `none`), modelling a removed background. */
async function seedBackgroundPin(db: Awaited<ReturnType<typeof freshDb>>, owner: UserId, assetId?: string, hash?: string): Promise<void> {
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
    const owner = await seedUser(db, { handle: "owner" });
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
    const owner = await seedUser(db, { handle: "owner" });
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
    const owner = await seedUser(db, { handle: "owner" });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(3),
      kind: "avatar",
      mime: PNG,
    });
    const character = await seedCharacter(db, owner, { handle: "hero" });
    await setCharacterAvatar(db, character, stored.assetId);
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(0);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("grace window protects a recently-touched unreferenced blob", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
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
    const owner = await seedUser(db, { handle: "owner" });
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

  test("keeps a background asset pinned only in appearance JSON, even when old (PD-131 anti-reap)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
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
    const owner = await seedUser(db, { handle: "owner" });
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(11), kind: "background", mime: PNG });
    // The ONLY liveness signal is the JSON background_override column on the character card.
    const characterId = await seedCharacter(db, owner);
    await db
      .update(characters)
      .set({
        backgroundOverride: { kind: "asset", seededId: "", externalUrl: "", assetId: stored.assetId, assetHash: stored.hash, mime: PNG, provenanceUrl: "" },
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
    const owner = await seedUser(db, { handle: "owner" });
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(12), kind: "background", mime: PNG });
    // The ONLY liveness signal is the JSON metadata.background sub-blob on the chat row.
    await db.insert(chats).values({
      id: castId<ChatId>("chat_bgc"),
      metadata: { background: { kind: "asset", seededId: "", externalUrl: "", assetId: stored.assetId, assetHash: stored.hash, mime: PNG, provenanceUrl: "" } },
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
    const owner = await seedUser(db, { handle: "owner" });
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
    const owner = await seedUser(db, { handle: "owner" });
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
    const owner = await seedUser(db, { handle: "owner" });
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
    const owner = await seedUser(db, { handle: "owner" });
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(13), kind: "background", mime: PNG });
    // A hand-crafted / pre-canonicalization row: `kind:"none"` but carrying a populated `assetId`. The GC scan's
    // kind guard must NOT root it — nothing legitimately references the blob, so it is reaped past grace.
    await db.insert(chats).values({
      id: castId<ChatId>("chat_smuggle"),
      metadata: { background: { kind: "none", seededId: "", externalUrl: "", assetId: stored.assetId, assetHash: stored.hash, mime: PNG, provenanceUrl: "" } },
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
    const owner = await seedUser(db, { handle: "owner" });
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(14), kind: "background", mime: PNG });
    const characterId = await seedCharacter(db, owner);
    await db
      .update(characters)
      .set({
        backgroundOverride: { kind: "none", seededId: "", externalUrl: "", assetId: stored.assetId, assetHash: stored.hash, mime: PNG, provenanceUrl: "" },
      })
      .where(eq(characters.id, characterId));
    await setBlobMtime(h, owner, stored.hash, FROZEN_AT_MS - TWO_HOURS_MS);

    const result = await svc.collectGarbage({});

    expect(result.reclaimed).toBe(1);
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(0);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(false);
  });
});
