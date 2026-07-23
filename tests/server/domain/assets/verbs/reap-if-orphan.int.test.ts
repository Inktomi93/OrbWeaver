// verb: reapIfOrphan — targeted NO-grace reap of a known id set. Load-bearing assertions:
//   • an UNREFERENCED asset is reaped (row + blob gone) and counted.
//   • an asset still referenced by ANY registry column (a character avatar) is LEFT ALONE — the registry,
//     not the caller's word, decides liveness (an asset can be avatar of A while B's remove passes its id).
//   • a reference via a DIFFERENT column (gallery) also protects it (the registry is a UNION).
//   • CRASH-INJECTION: a mid-delete `cas.remove` failure leaves a blob-with-no-row (benign, self-heals),
//     NEVER a row-with-no-blob — the drop-row-BEFORE-blob ordering.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { assets, characters, chats, userSettings } from "@orb/db";
import { createAssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, pngBytes, principal, seedCharacter, seedChatRow, seedUser, setCharacterAvatar } from "../_support.ts";

const PNG = "image/png";

describe("reapIfOrphan", () => {
  test("reaps an unreferenced asset (row + blob gone), counts it", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stored = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(1),
      kind: "avatar",
      mime: PNG,
    });

    const result = await svc.reapIfOrphan([stored.assetId]);

    expect(result).toEqual({ checked: 1, reaped: 1 });
    const rows = await db.select().from(assets).where(eq(assets.id, stored.assetId));
    expect(rows).toHaveLength(0);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(false);
  });

  test("does NOT reap an asset still referenced by a character avatar", async () => {
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
    const character = await seedCharacter(db, owner, { handle: "hero" });
    await setCharacterAvatar(db, character, stored.assetId);

    const result = await svc.reapIfOrphan([stored.assetId]);

    expect(result).toEqual({ checked: 1, reaped: 0 });
    const rows = await db.select().from(assets).where(eq(assets.id, stored.assetId));
    expect(rows).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("does NOT reap an asset referenced via the gallery column (registry is a union)", async () => {
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
    await svc.addToGallery({ principal: principal(owner), assetId: stored.assetId });

    const result = await svc.reapIfOrphan([stored.assetId]);

    expect(result.reaped).toBe(0);
    const rows = await db.select().from(assets).where(eq(assets.id, stored.assetId));
    expect(rows).toHaveLength(1);
  });

  test("does NOT reap an asset referenced ONLY by a host-set chat background (chats.metadata.background JSON — BG-C)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(20), kind: "background", mime: PNG });
    // NO FK column references it — the ONLY liveness signal is the carried-background JSON live-source. Before the
    // fix the FK-only `selectReferencedAmong` missed this pin and the NO-GRACE targeted reap purged a live blob.
    const chatId = await seedChatRow(db, "chat_bgc");
    await db
      .update(chats)
      .set({
        metadata: {
          background: { kind: "asset", seededId: "", externalUrl: "", assetId: stored.assetId, assetHash: stored.hash, mime: PNG, provenanceUrl: "" },
        },
      })
      .where(eq(chats.id, chatId));

    const result = await svc.reapIfOrphan([stored.assetId]);

    expect(result).toEqual({ checked: 1, reaped: 0 });
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("does NOT reap an asset referenced ONLY by a settings background (user_settings.config JSON — the pre-BG-C gap this closes)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(21), kind: "background", mime: PNG });
    // The ONLY liveness signal is the appearance JSON pin — no FK column. The FK-only targeted reap missed this
    // pre-existing (PD-131) live-source too, so the same regression pin covers both JSON sources.
    await db.insert(userSettings).values({
      userId: owner,
      config: {
        ...DEFAULT_USER_SETTINGS,
        appearance: { ...DEFAULT_USER_SETTINGS.appearance, backgroundImageKind: "asset", backgroundAssetId: stored.assetId, backgroundAssetHash: stored.hash },
      },
    });

    const result = await svc.reapIfOrphan([stored.assetId]);

    expect(result).toEqual({ checked: 1, reaped: 0 });
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
  });

  test("dedup-collision regression: an avatar asset ALSO pinned as a chat background survives after its avatar FK dies", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: "owner" });
    // ONE asset (CAS dedup): a character avatar (FK) AND a chat carried background (JSON). Removing the character
    // drops the avatar FK; the JSON pin must keep the blob alive — the exact silent-data-loss path the fix closes.
    const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(22), kind: "avatar", mime: PNG });
    const character = await seedCharacter(db, owner, { handle: "hero" });
    await setCharacterAvatar(db, character, stored.assetId);
    const chatId = await seedChatRow(db, "chat_dedup");
    await db
      .update(chats)
      .set({
        metadata: {
          background: { kind: "asset", seededId: "", externalUrl: "", assetId: stored.assetId, assetHash: stored.hash, mime: PNG, provenanceUrl: "" },
        },
      })
      .where(eq(chats.id, chatId));
    // The character (and its avatar FK) is gone — only the JSON background pin remains.
    await db.delete(characters).where(eq(characters.id, character));

    const result = await svc.reapIfOrphan([stored.assetId]);

    expect(result).toEqual({ checked: 1, reaped: 0 });
    expect(await db.select().from(assets).where(eq(assets.id, stored.assetId))).toHaveLength(1);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });

  test("crash-injection: a failed cas.remove leaves a blob-no-row, never a row-no-blob", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const owner = await seedUser(db, { handle: "owner" });
    // Seed the asset through the real service first (real row + real blob).
    const stored = await createAssetsService(h.ctx).store({
      principal: principal(owner),
      bytes: pngBytes(4),
      kind: "avatar",
      mime: PNG,
    });

    // A ctx whose CAS `remove` throws mid-delete — the row is deleted BEFORE this, so we prove the ordering.
    const failingCas = {
      ...h.ctx.cas,
      remove: () => Promise.reject(new Error("disk gone")),
    };
    const svc = createAssetsService({ ...h.ctx, cas: failingCas });

    await expect(svc.reapIfOrphan([stored.assetId])).rejects.toThrow("disk gone");

    // The invariant: the ROW is already gone (deleted first); the BLOB survives (its remove failed) — a
    // benign orphan the next sweep reclaims, NEVER a row pointing at a missing blob.
    const rows = await db.select().from(assets).where(eq(assets.id, stored.assetId));
    expect(rows).toHaveLength(0);
    expect(await h.ctx.cas.exists(owner, stored.hash)).toBe(true);
  });
});
