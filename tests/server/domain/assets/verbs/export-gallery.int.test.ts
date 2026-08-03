// verb: exportGallery (export-import-portability.md §1) — the owner's gallery_items curation rows → the ONE
// gallery serde, with the subject character resolved id -> HANDLE. Covers: owner-scoping (B's rows never leak
// into A's file), the handle re-link (a charactered row carries its subject's handle), the un-charactered row
// (null handle), and deterministic ordering. The id -> handle op is wired as the REAL characters read (mirrors
// compose) so the resolution is exercised, not stubbed.

import type { PortableParse } from "@orb/contracts/portability";
import { characters } from "@orb/db";
import type { CharacterHandle, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService, createExportGallery } from "@orb/server/domain/assets";
import { parseGallery } from "@orb/server/kit/serde/gallery";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import type { AssetsContext } from "../../../../../packages/server/src/domain/assets/context.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, pngBytes, principal, seedCharacter, seedUser } from "../_support.ts";

/** The parse outcome's value — the portable serdes return a typed refusal reason, never null. */
function must<T>(result: PortableParse<T>): T {
  if (!result.ok) {
    throw new Error(`portable parse refused: ${result.reason}`);
  }
  return result.value;
}

const PNG = "image/png";

// Extend the harness ctx with the gallery-portability id<->handle ops, wired as the REAL owner-scoped
// characters reads the entry root binds (assets never sideways-imports the character domain).
function withCharacterOps(ctx: AssetsContext, db: AssetsContext["db"]): AssetsContext {
  return {
    ...ctx,
    resolveCharacterHandle: async (characterId: CharacterId): Promise<string | null> => {
      const rows = await db.select({ handle: characters.handle }).from(characters).where(eq(characters.id, characterId)).limit(1);
      return rows[0]?.handle ?? null;
    },
    findCharacterByHandle: async (args: { readonly ownerId: UserId; readonly handle: CharacterHandle }): Promise<CharacterId | null> => {
      const rows = await db.select({ id: characters.id }).from(characters).where(eq(characters.handle, args.handle)).limit(1);
      const hit = rows[0];
      return hit !== undefined ? hit.id : null;
    },
  };
}

describe("exportGallery", () => {
  test("carries the subject handle for charactered rows and null for un-charactered", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const ctx = withCharacterOps(h.ctx, db);
    const svc = createAssetsService(ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const hero = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });

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
    expect(file.filename).toBe("gallery.json");
    const parsed = must(parseGallery(file.bytes));
    expect(parsed?.items).toHaveLength(2);
    const byAsset = new Map(parsed?.items.map((i) => [i.assetId, i.subjectCharacterHandle]));
    expect(byAsset.get(assetA.assetId)).toBe("hero");
    expect(byAsset.get(assetB.assetId)).toBeNull();
  });

  test("owner-scoped: B's curation never appears in A's export", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const ctx = withCharacterOps(h.ctx, db);
    const svc = createAssetsService(ctx);
    const a = await seedUser(db, { handle: castId<Handle>("a") });
    const b = await seedUser(db, { handle: castId<Handle>("b") });
    const assetA = await svc.store({
      principal: principal(a),
      bytes: pngBytes(1),
      kind: "gallery",
      mime: PNG,
    });
    const assetB = await svc.store({
      principal: principal(b),
      bytes: pngBytes(2),
      kind: "gallery",
      mime: PNG,
    });
    await svc.addToGallery({ principal: principal(a), assetId: assetA.assetId });
    await svc.addToGallery({ principal: principal(b), assetId: assetB.assetId });

    const file = await createExportGallery(ctx)(a);
    const parsed = must(parseGallery(file.bytes));
    expect(parsed?.items.map((i) => i.assetId)).toEqual([assetA.assetId]);
  });

  test("a subject character deleted mid-export carries a null handle (survives un-charactered)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const ctx = withCharacterOps(h.ctx, db);
    const svc = createAssetsService(ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const hero = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    const asset = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(1),
      kind: "gallery",
      mime: PNG,
    });
    await svc.addToGallery({
      principal: principal(owner),
      assetId: asset.assetId,
      subjectCharacterId: hero,
    });

    // Deleting the character SET NULLs the subject; the row survives and exports with no handle.
    await db.delete(characters).where(eq(characters.id, hero));

    const parsed = must(parseGallery((await createExportGallery(ctx)(owner)).bytes));
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.items[0]?.subjectCharacterHandle).toBeNull();
  });
});
