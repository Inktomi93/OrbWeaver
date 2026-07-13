// verb: importGallery (export-import-portability.md §1) — ONE portable gallery file → the owner's gallery_items
// curation rows. Covers: the export -> wipe -> import ROUND-TRIP (rows reconstruct, subject re-linked by
// HANDLE to this box's character id), the un-charactered FALLBACK (a handle with no matching character imports
// null), IDEMPOTENCY (re-import writes zero dupes — including the NULL-subject case SQLite's unique index
// misses), the asset-not-restored SKIP (a curation row cannot reference a foreign/absent asset), and a bad
// file returning {ok:false} not throwing. The handle<->id ops are wired as the REAL characters reads (compose
// mirror) so the re-link is exercised, not stubbed.

import { characters } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import {
  createAssetsService,
  createExportGallery,
  createImportGallery,
} from "@orb/server/domain/assets";
import { buildGallery } from "@orb/server/kit/serde/gallery";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import type { AssetsContext } from "../../../../../packages/server/src/domain/assets/context.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, pngBytes, principal, seedCharacter, seedUser } from "../_support.ts";

const PNG = "image/png";

// Extend the harness ctx with the gallery-portability id<->handle ops, wired as the REAL owner-scoped
// characters reads the entry root binds (assets never sideways-imports the character domain).
function withCharacterOps(ctx: AssetsContext, db: AssetsContext["db"]): AssetsContext {
  return {
    ...ctx,
    resolveCharacterHandle: async (characterId: CharacterId): Promise<string | null> => {
      const rows = await db
        .select({ handle: characters.handle })
        .from(characters)
        .where(eq(characters.id, characterId))
        .limit(1);
      return rows[0]?.handle ?? null;
    },
    findCharacterByHandle: async (args: {
      readonly ownerId: UserId;
      readonly handle: string;
    }): Promise<CharacterId | null> => {
      const rows = await db
        .select({ id: characters.id })
        .from(characters)
        .where(eq(characters.handle, args.handle))
        .limit(1);
      const hit = rows[0];
      return hit !== undefined ? hit.id : null;
    },
  };
}

describe("importGallery", () => {
  test("export -> wipe -> import reconstructs the rows, re-linking the subject by handle", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const ctx = withCharacterOps(h.ctx, db);
    const svc = createAssetsService(ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const hero = await seedCharacter(db, owner, { handle: "hero" });
    const assetA = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(1),
      kind: "gallery",
      mime: PNG,
    });
    const assetB = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(2),
      kind: "gallery",
      mime: PNG,
    });
    await svc.addToGallery({
      principal: principal(owner),
      assetId: assetA.assetId,
      subjectCharacterId: hero,
    });
    await svc.addToGallery({ principal: principal(owner), assetId: assetB.assetId });

    const file = await createExportGallery(ctx)(owner);
    // Wipe the live curation, then restore from the file (the subject travels as the handle "hero", not the id).
    const live = await svc.listGallery({ principal: principal(owner), limit: 100 });
    await Promise.all(
      live.map((item) =>
        svc.removeFromGallery({ principal: principal(owner), galleryItemId: item.galleryItemId }),
      ),
    );
    expect(await svc.listGallery({ principal: principal(owner), limit: 100 })).toHaveLength(0);

    const outcome = await createImportGallery(ctx)(owner, file);
    expect(outcome).toEqual({ ok: true, created: true });
    const restored = await svc.listGallery({ principal: principal(owner), limit: 100 });
    const subjectByAsset = new Map(restored.map((r) => [r.assetId, r.subjectCharacterId]));
    expect(subjectByAsset.get(assetA.assetId)).toBe(hero);
    expect(subjectByAsset.get(assetB.assetId)).toBeNull();
  });

  test("an unresolved handle imports un-charactered (subjectCharacterId null)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const ctx = withCharacterOps(h.ctx, db);
    const svc = createAssetsService(ctx);
    const owner = await seedUser(db, { handle: "owner" });
    const asset = await svc.store({
      principal: principal(owner),
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
    const rows = await svc.listGallery({ principal: principal(owner), limit: 100 });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.subjectCharacterId).toBeNull();
  });

  test("idempotent: a second import of the same file writes zero dupes (incl. null subject)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const ctx = withCharacterOps(h.ctx, db);
    const svc = createAssetsService(ctx);
    const owner = await seedUser(db, { handle: "owner" });
    await seedCharacter(db, owner, { handle: "hero" });
    const asset = await svc.store({
      principal: principal(owner),
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
    expect(await svc.listGallery({ principal: principal(owner), limit: 100 })).toHaveLength(2);
    // Re-import: both rows dedup on (assetId, subjectCharacterId) — the null-subject row too.
    expect(await createImportGallery(ctx)(owner, file)).toEqual({ ok: true, created: false });
    expect(await svc.listGallery({ principal: principal(owner), limit: 100 })).toHaveLength(2);
  });

  test("skips a row whose asset was not restored (never violates the FK)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const ctx = withCharacterOps(h.ctx, db);
    const svc = createAssetsService(ctx);
    const owner = await seedUser(db, { handle: "owner" });
    // A well-formed asset id that was never restored on this box → survives parse, skipped at the ownership gate.
    const phantom = mintTypeId(ID_PREFIX.asset);
    const file = {
      filename: "gallery.json",
      bytes: buildGallery({
        items: [{ assetId: phantom, subjectCharacterHandle: null, createdAt: 100 }],
      }),
    };

    expect(await createImportGallery(ctx)(owner, file)).toEqual({ ok: true, created: false });
    expect(await svc.listGallery({ principal: principal(owner), limit: 100 })).toHaveLength(0);
  });

  test("a non-gallery file returns ok:false, never throwing", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const ctx = withCharacterOps(h.ctx, db);
    const owner = await seedUser(db, { handle: "owner" });
    const file = { filename: "gallery.json", bytes: new TextEncoder().encode("{not a gallery") };
    const outcome = await createImportGallery(ctx)(owner, file);
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("gallery.json");
  });
});
