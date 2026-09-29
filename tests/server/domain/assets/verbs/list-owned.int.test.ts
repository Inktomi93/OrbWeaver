// verb: listOwned — gallery v1 (§1.2). Owner-scoped, optional kind filter, keyset paging. The paging test
// is the load-bearing one: ≥3 rows share one `uploadedAt` (the frozen clock stamps every store the same
// millisecond — exactly the bulk-import case the `(uploadedAt, id)` tiebreak exists for), walked in pages
// of 2 with no skip and no duplicate.

import type { StoredAsset } from "@orb/contracts/assets";
import type { CharacterHandle, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createAssetsService } from "@orb/server/domain/assets";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { gifBytes, makeHarness, pngBytes, principal, row, seedCharacter, seedUser } from "../_support.ts";

const PNG = "image/png";
const PAGE = 2;
const ALL = 100;

describe("listOwned", () => {
  test("owner-scoped: A never sees B's assets (with or without a kind filter)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const a = await seedUser(db, { handle: castId<Handle>("a") });
    const b = await seedUser(db, { handle: castId<Handle>("b") });

    const aStored = await svc.store({
      principal: principal(a),
      bytes: pngBytes(1),
      kind: "avatar",
      mime: PNG,
    });
    await svc.store({ principal: principal(b), bytes: pngBytes(2), kind: "avatar", mime: PNG });

    const aList = await svc.listOwned({ principal: principal(a), limit: ALL });
    expect(aList.map((r) => r.assetId)).toEqual([aStored.assetId]);
  });

  test("kind filter: only the requested kind; omitted returns all kinds", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const avatar = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(1),
      kind: "avatar",
      mime: PNG,
    });
    const card = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(2),
      kind: "card",
      mime: PNG,
    });

    const avatarsOnly = await svc.listOwned({
      principal: principal(owner),
      kind: "avatar",
      limit: ALL,
    });
    expect(avatarsOnly.map((r) => r.assetId)).toEqual([avatar.assetId]);

    const all = await svc.listOwned({ principal: principal(owner), limit: ALL });
    expect(new Set(all.map((r) => r.assetId))).toEqual(new Set([avatar.assetId, card.assetId]));
  });

  test("the view carries the stored `animated` byte-fact (G2)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    const gif = await svc.store({
      principal: principal(owner),
      bytes: gifBytes(1),
      kind: "gallery",
      mime: "image/gif",
    });
    const png = await svc.store({
      principal: principal(owner),
      bytes: pngBytes(1),
      kind: "gallery",
      mime: PNG,
    });

    const list = await svc.listOwned({ principal: principal(owner), limit: ALL });
    const byId = new Map(list.map((r) => [r.assetId, r.animated]));
    expect(byId.get(gif.assetId)).toBe(true); // every GIF ⇒ animated
    expect(byId.get(png.assetId)).toBe(false); // a static PNG ⇒ not
  });

  test("keyset paging: rows sharing one uploadedAt walk in pages with no skip/dup", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });

    // 5 rows all stamped the SAME frozen `uploadedAt` — the bulk-import case the (uploadedAt, id) tiebreak
    // exists for. Stored sequentially so the injected minter stamps deterministic ascending ids.
    const stored: StoredAsset[] = [];
    for (let i = 0; i < 5; i++) {
      const s = await svc.store({
        principal: principal(owner),
        bytes: pngBytes(i),
        kind: "avatar",
        mime: PNG,
      });
      stored.push(s);
    }
    const expectedIds = new Set(stored.map((s) => s.assetId));

    // Walk pages of 2 via the (uploadedAt, id) cursor from each page's last row.
    const p1 = await svc.listOwned({ principal: principal(owner), limit: PAGE });
    const c1 = row(p1, 1);
    const p2 = await svc.listOwned({
      principal: principal(owner),
      limit: PAGE,
      cursor: { uploadedAt: c1.uploadedAt, assetId: c1.assetId },
    });
    const c2 = row(p2, 1);
    const p3 = await svc.listOwned({
      principal: principal(owner),
      limit: PAGE,
      cursor: { uploadedAt: c2.uploadedAt, assetId: c2.assetId },
    });

    expect(p1).toHaveLength(PAGE);
    expect(p2).toHaveLength(PAGE);
    expect(p3).toHaveLength(1); // short page = end of list
    const seen = [...p1, ...p2, ...p3].map((r) => r.assetId);
    expect(new Set(seen)).toEqual(expectedIds); // no skip, no dup
  });
});

// The gallery add-picker's read: the caller's own IMAGES not already in one character's gallery, filtered on the
// server so a page is never emptied client-side and "nothing left to add" is true only on the last page.
describe("listOwned — galleryCandidatesFor", () => {
  test("returns only the owner's images not already in that character's gallery", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const hero = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    const other = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("other") });

    const inHero = await svc.store({ principal: principal(owner), bytes: pngBytes(1), kind: "gallery", mime: PNG });
    const inOther = await svc.store({ principal: principal(owner), bytes: pngBytes(2), kind: "gallery", mime: PNG });
    const loose = await svc.store({ principal: principal(owner), bytes: gifBytes(3), kind: "avatar", mime: "image/gif" });
    const notImage = await svc.store({ principal: principal(owner), bytes: new TextEncoder().encode("notes"), kind: "document", mime: "text/plain" });
    await svc.addToGallery({ principal: principal(owner), assetId: inHero.assetId, subjectCharacterId: hero });
    await svc.addToGallery({ principal: principal(owner), assetId: inOther.assetId, subjectCharacterId: other });

    const candidates = await svc.listOwned({ principal: principal(owner), limit: ALL, galleryCandidatesFor: hero });
    expect(new Set(candidates.map((r) => r.assetId))).toEqual(new Set([inOther.assetId, loose.assetId]));
    expect(candidates.map((r) => r.assetId)).not.toContain(notImage.assetId);
  });

  test("keeps the owner scope: another owner's images never appear, whatever gallery is named", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const a = await seedUser(db, { handle: castId<Handle>("a") });
    const b = await seedUser(db, { handle: castId<Handle>("b") });
    const bHero = await seedCharacter(db, b, { handle: castId<CharacterHandle>("bhero") });
    const aImage = await svc.store({ principal: principal(a), bytes: pngBytes(1), kind: "gallery", mime: PNG });
    await svc.store({ principal: principal(b), bytes: pngBytes(2), kind: "gallery", mime: PNG });

    const aView = await svc.listOwned({ principal: principal(a), limit: ALL, galleryCandidatesFor: bHero });
    expect(aView.map((r) => r.assetId)).toEqual([aImage.assetId]);
  });

  test("pages past a full page with no skip or repeat, the filter applied before the limit", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const hero = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    const candidates: StoredAsset[] = [];
    for (let i = 0; i < 5; i++) {
      h.advance(1);
      const stored = await svc.store({ principal: principal(owner), bytes: pngBytes(i), kind: "gallery", mime: PNG });
      // Every other image is already in the gallery: a client-side filter would leave short, uneven pages.
      if (i % 2 === 0) {
        candidates.push(stored);
      } else {
        await svc.addToGallery({ principal: principal(owner), assetId: stored.assetId, subjectCharacterId: hero });
      }
    }

    const p1 = await svc.listOwned({ principal: principal(owner), limit: PAGE, galleryCandidatesFor: hero });
    const c1 = row(p1, 1);
    const p2 = await svc.listOwned({
      principal: principal(owner),
      limit: PAGE,
      galleryCandidatesFor: hero,
      cursor: { uploadedAt: c1.uploadedAt, assetId: c1.assetId },
    });
    expect(p1).toHaveLength(PAGE);
    expect(p2).toHaveLength(1);
    expect([...p1, ...p2].map((r) => r.assetId)).toEqual([...candidates].reverse().map((s) => s.assetId));
  });
});
