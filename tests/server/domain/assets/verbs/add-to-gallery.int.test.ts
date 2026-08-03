// verb: addToGallery — gallery v2 (§1.3). Owner-only posture: the asset AND (when given) the subject
// character must be the caller's; a foreign/missing asset or character rejects with a NOT_FOUND-mapped
// DomainNotFoundError (leak-free). Upsert-guarded on `(assetId, subjectCharacterId)` → a duplicate add is
// idempotent (returns the existing item).

import { DomainNotFoundError } from "@orb/kit/errors";
import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, pngBytes, principal, seedCharacter, seedUser } from "../_support.ts";

const PNG = "image/png";
const FROZEN_AT = 1_750_000_000_000;

describe("addToGallery", () => {
  test("curates an owned asset (with a subject character) into a full view", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    const asset = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(1),
      kind: "gallery",
      mime: PNG,
    });

    const view = await svc.addToGallery({
      principal: principal(owner),
      assetId: asset.assetId,
      subjectCharacterId: character,
    });

    expect(view).toMatchObject({
      assetId: asset.assetId,
      hash: asset.hash,
      mime: PNG,
      subjectCharacterId: character,
      createdAt: FROZEN_AT,
    });
    expect(view.galleryItemId).toBeDefined();
  });

  test("un-charactered add: subjectCharacterId is null", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const asset = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(2),
      kind: "gallery",
      mime: PNG,
    });

    const view = await svc.addToGallery({ principal: principal(owner), assetId: asset.assetId });
    expect(view.subjectCharacterId).toBeNull();
  });

  test("upsert-guard: re-adding the same (asset, subject) is idempotent", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const character = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    const asset = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(3),
      kind: "gallery",
      mime: PNG,
    });

    const first = await svc.addToGallery({
      principal: principal(owner),
      assetId: asset.assetId,
      subjectCharacterId: character,
    });
    const second = await svc.addToGallery({
      principal: principal(owner),
      assetId: asset.assetId,
      subjectCharacterId: character,
    });
    expect(second.galleryItemId).toBe(first.galleryItemId);

    const all = await svc.listGallery({ principal: principal(owner), limit: 100 });
    expect(all).toHaveLength(1);
  });

  test("rejects a foreign asset (leak-free NOT_FOUND)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreign = await svc.store({
      principal: principal(other),
      bytes: pngBytes(4),
      kind: "gallery",
      mime: PNG,
    });

    await expect(svc.addToGallery({ principal: principal(owner), assetId: foreign.assetId })).rejects.toBeInstanceOf(DomainNotFoundError);
  });

  test("rejects a foreign subject character (leak-free NOT_FOUND)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const other = await seedUser(db, { handle: castId<Handle>("other") });
    const foreignChar = await seedCharacter(db, other, { handle: castId<CharacterHandle>("villain") });
    const asset = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(5),
      kind: "gallery",
      mime: PNG,
    });

    await expect(
      svc.addToGallery({
        principal: principal(owner),
        assetId: asset.assetId,
        subjectCharacterId: foreignChar,
      }),
    ).rejects.toBeInstanceOf(DomainNotFoundError);
  });
});
