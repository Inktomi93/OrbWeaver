// verb: importGallery — ONE portable gallery file → the owner's gallery_items
// curation rows. Covers: the export -> wipe -> import ROUND-TRIP (rows reconstruct, subject re-linked by
// HANDLE to this box's character id), the un-charactered FALLBACK (a handle with no matching character imports
// null), IDEMPOTENCY (re-import writes zero dupes — including the NULL-subject case SQLite's unique index
// misses), the asset-not-restored SKIP (a curation row cannot reference a foreign/absent asset), and a bad
// file returning {ok:false} not throwing. The handle<->id ops are compose's own, over a real character
// service, so the owner-scoped re-link is exercised, not stubbed.

import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { createAssetsService, createExportGallery, createImportGallery } from "@orb/server/domain/assets";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe, onTestFinished } from "vitest";
import { buildGallery } from "#server/primitives/serde/gallery/index.ts";
import { makeHarness, pngBytes, principal, seedCharacter, seedUser, withGalleryCharacterOps } from "../_support.ts";

const PNG = "image/png";

describe("importGallery", () => {
  test("export -> wipe -> import reconstructs the rows, re-linking the subject by handle", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const ctx = withGalleryCharacterOps(h.ctx);
    const svc = createAssetsService(ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const hero = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    const assetA = await svc.store({
      principal: await principal(db, owner),
      bytes: pngBytes(1),
      kind: "gallery",
      mime: PNG,
    });
    const assetB = await svc.store({
      principal: await principal(db, owner),
      bytes: pngBytes(2),
      kind: "gallery",
      mime: PNG,
    });
    await svc.addToGallery({
      principal: await principal(db, owner),
      assetId: assetA.assetId,
      subjectCharacterId: hero,
    });
    await svc.addToGallery({ principal: await principal(db, owner), assetId: assetB.assetId });

    const file = await createExportGallery(ctx)(owner);
    // Wipe the live curation, then restore from the file (the subject travels as the handle "hero", not the id).
    const live = await svc.listGallery({ principal: await principal(db, owner), limit: 100 });
    await Promise.all(live.map(async (item) => svc.removeFromGallery({ principal: await principal(db, owner), galleryItemId: item.galleryItemId })));
    expect(await svc.listGallery({ principal: await principal(db, owner), limit: 100 })).toHaveLength(0);

    const outcome = await createImportGallery(ctx)(owner, file);
    expect(outcome).toEqual({ ok: true, created: true });
    const restored = await svc.listGallery({ principal: await principal(db, owner), limit: 100 });
    const subjectByAsset = new Map(restored.map((r) => [r.assetId, r.subjectCharacterId]));
    expect(subjectByAsset.get(assetA.assetId)).toBe(hero);
    expect(subjectByAsset.get(assetB.assetId)).toBeNull();
  });

  test("an unresolved handle imports un-charactered (subjectCharacterId null)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const ctx = withGalleryCharacterOps(h.ctx);
    const svc = createAssetsService(ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const asset = await svc.store({
      principal: await principal(db, owner),
      bytes: pngBytes(1),
      kind: "gallery",
      mime: PNG,
    });
    const file = {
      filename: "gallery.json",
      bytes: buildGallery({
        items: [{ assetId: asset.assetId, subjectCharacterHandle: "ghost", createdAt: 100 }],
      }),
    };

    expect(await createImportGallery(ctx)(owner, file)).toEqual({ ok: true, created: true });
    const rows = await svc.listGallery({ principal: await principal(db, owner), limit: 100 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subjectCharacterId).toBeNull();
  });

  test("a handle only ANOTHER owner holds never re-links to their character", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const ctx = withGalleryCharacterOps(h.ctx);
    const svc = createAssetsService(ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    await seedCharacter(db, stranger, { id: "character_strangers_hero", handle: castId<CharacterHandle>("hero") });
    const asset = await svc.store({ principal: await principal(db, owner), bytes: pngBytes(1), kind: "gallery", mime: PNG });
    const file = {
      filename: "gallery.json",
      bytes: buildGallery({ items: [{ assetId: asset.assetId, subjectCharacterHandle: "hero", createdAt: 100 }] }),
    };

    expect(await createImportGallery(ctx)(owner, file)).toEqual({ ok: true, created: true });
    const rows = await svc.listGallery({ principal: await principal(db, owner), limit: 100 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subjectCharacterId).toBeNull();
  });

  test("idempotent: a second import of the same file writes zero dupes (incl. null subject)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const ctx = withGalleryCharacterOps(h.ctx);
    const svc = createAssetsService(ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    const asset = await svc.store({
      principal: await principal(db, owner),
      bytes: pngBytes(1),
      kind: "gallery",
      mime: PNG,
    });
    const file = {
      filename: "gallery.json",
      bytes: buildGallery({
        items: [
          { assetId: asset.assetId, subjectCharacterHandle: "hero", createdAt: 100 },
          { assetId: asset.assetId, subjectCharacterHandle: null, createdAt: 200 },
        ],
      }),
    };

    expect(await createImportGallery(ctx)(owner, file)).toEqual({ ok: true, created: true });
    expect(await svc.listGallery({ principal: await principal(db, owner), limit: 100 })).toHaveLength(2);
    // Re-import: both rows dedup on (assetId, subjectCharacterId) — the null-subject row too.
    expect(await createImportGallery(ctx)(owner, file)).toEqual({ ok: true, created: false });
    expect(await svc.listGallery({ principal: await principal(db, owner), limit: 100 })).toHaveLength(2);
  });

  test("skips a row whose asset was not restored (never violates the FK)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const ctx = withGalleryCharacterOps(h.ctx);
    const svc = createAssetsService(ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    // A well-formed asset id that was never restored on this box → survives parse, skipped at the ownership gate.
    const phantom = mintTypeId(ID_PREFIX.asset);
    const file = {
      filename: "gallery.json",
      bytes: buildGallery({
        items: [{ assetId: phantom, subjectCharacterHandle: null, createdAt: 100 }],
      }),
    };

    expect(await createImportGallery(ctx)(owner, file)).toEqual({ ok: true, created: false });
    expect(await svc.listGallery({ principal: await principal(db, owner), limit: 100 })).toHaveLength(0);
  });

  test("a non-gallery file returns ok:false, never throwing", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const ctx = withGalleryCharacterOps(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const file = { filename: "gallery.json", bytes: new TextEncoder().encode("{not a gallery") };
    const outcome = await createImportGallery(ctx)(owner, file);
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("gallery.json");
  });
});
