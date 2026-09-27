// verb: listGallery — gallery v2 (§1.3). Owner-scoped via the asset join (no stamped owner column),
// optional subject and room filters, keyset paging by (createdAt, galleryItemId). Also covers the character
// SET NULL FK: deleting the subject character nulls `subjectCharacterId` and the item survives un-charactered.

import type { GalleryItemView } from "@orb/contracts/assets";
import type { Db } from "@orb/db";
import { characters, imageryGenerations } from "@orb/db";
import type { AssetId, CharacterHandle, CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { AssetsService } from "@orb/server/domain/assets";
import { createAssetsService } from "@orb/server/domain/assets";
import { eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId } from "../../../../support/inference-identities.ts";
import { makeHarness, pngBytes, principal, row, seedCharacter, seedChatRow, seedUser } from "../_support.ts";

const PNG = "image/png";
const ALL = 100;
const PAGE = 2;

async function addAsset(svc: AssetsService, owner: UserId, tail: number, subjectCharacterId?: CharacterId): Promise<GalleryItemView> {
  const asset = await svc.store({
    principal: principal(owner),
    bytes: pngBytes(tail),
    kind: "gallery",
    mime: PNG,
  });
  return svc.addToGallery({
    principal: principal(owner),
    assetId: asset.assetId,
    ...(subjectCharacterId !== undefined ? { subjectCharacterId } : {}),
  });
}

/** Record that `assetId` was generated in `chatId` — the imagery provenance row the room filter keys on. */
async function bornIn(db: Db, assetId: AssetId, chatId: ChatId): Promise<void> {
  await db.insert(imageryGenerations).values({
    id: mintTypeId(ID_PREFIX.imageryGeneration),
    assetId,
    chatId,
    mode: "free",
    prompt: "a lighthouse at dusk",
    model: testModelId("image-model"),
  });
}

describe("listGallery", () => {
  test("owner-scoped: B never sees A's items", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const a = await seedUser(db, { handle: castId<Handle>("a") });
    const b = await seedUser(db, { handle: castId<Handle>("b") });
    const aItem = await addAsset(svc, a, 1);
    await addAsset(svc, b, 2);

    const aList = await svc.listGallery({ principal: principal(a), limit: ALL });
    expect(aList.map((r) => r.galleryItemId)).toEqual([aItem.galleryItemId]);
  });

  test("subject filter: only that character's items; omitted returns all", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const hero = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    const heroItem = await addAsset(svc, owner, 1, hero);
    const looseItem = await addAsset(svc, owner, 2);

    const filtered = await svc.listGallery({
      principal: principal(owner),
      subjectCharacterId: hero,
      limit: ALL,
    });
    expect(filtered.map((r) => r.galleryItemId)).toEqual([heroItem.galleryItemId]);

    const all = await svc.listGallery({ principal: principal(owner), limit: ALL });
    expect(new Set(all.map((r) => r.galleryItemId))).toEqual(new Set([heroItem.galleryItemId, looseItem.galleryItemId]));
  });

  test("deleting the character nulls subjectCharacterId (the item survives)", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const hero = await seedCharacter(db, owner, { handle: castId<CharacterHandle>("hero") });
    const item = await addAsset(svc, owner, 1, hero);

    await db.delete(characters).where(eq(characters.id, hero));

    const list = await svc.listGallery({ principal: principal(owner), limit: ALL });
    expect(list).toHaveLength(1);
    const only = row(list, 0);
    expect(only.galleryItemId).toBe(item.galleryItemId);
    expect(only.subjectCharacterId).toBeNull();
  });

  test("keyset paging walks all items with no skip/dup", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    // 3 items, all stamped the same frozen createdAt → the (createdAt, galleryItemId) tiebreak orders them.
    const i0 = await addAsset(svc, owner, 0);
    const i1 = await addAsset(svc, owner, 1);
    const i2 = await addAsset(svc, owner, 2);
    const expected = new Set([i0.galleryItemId, i1.galleryItemId, i2.galleryItemId]);

    const p1 = await svc.listGallery({ principal: principal(owner), limit: PAGE });
    const c1 = row(p1, 1);
    const p2 = await svc.listGallery({
      principal: principal(owner),
      limit: PAGE,
      cursor: c1.createdAt,
      cursorId: c1.galleryItemId,
    });

    expect(p1).toHaveLength(PAGE);
    expect(p2).toHaveLength(1); // short page = end of list
    const seen = [...p1, ...p2].map((r) => r.galleryItemId);
    expect(new Set(seen)).toEqual(expected); // no skip, no dup
  });

  test("room filter: only items whose picture was generated in that chat; omitted returns all", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const here = await seedChatRow(db, mintTypeId(ID_PREFIX.chat));
    const elsewhere = await seedChatRow(db, mintTypeId(ID_PREFIX.chat));
    const hereItem = await addAsset(svc, owner, 1);
    const elsewhereItem = await addAsset(svc, owner, 2);
    const uploadItem = await addAsset(svc, owner, 3);
    await bornIn(db, hereItem.assetId, here);
    await bornIn(db, elsewhereItem.assetId, elsewhere);

    const filtered = await svc.listGallery({ principal: principal(owner), chatId: here, limit: ALL });
    expect(filtered.map((r) => r.galleryItemId)).toEqual([hereItem.galleryItemId]);

    const all = await svc.listGallery({ principal: principal(owner), limit: ALL });
    expect(new Set(all.map((r) => r.galleryItemId))).toEqual(new Set([hereItem.galleryItemId, elsewhereItem.galleryItemId, uploadItem.galleryItemId]));
  });

  test("room filter keeps the owner scope: naming a shared room never lists another member's pictures", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const host = await seedUser(db, { handle: castId<Handle>("host") });
    const member = await seedUser(db, { handle: castId<Handle>("member") });
    const stranger = await seedUser(db, { handle: castId<Handle>("stranger") });
    const room = await seedChatRow(db, mintTypeId(ID_PREFIX.chat));
    const strangerRoom = await seedChatRow(db, mintTypeId(ID_PREFIX.chat));
    const hostItem = await addAsset(svc, host, 1);
    const memberItem = await addAsset(svc, member, 2);
    const strangerItem = await addAsset(svc, stranger, 3);
    await bornIn(db, hostItem.assetId, room);
    await bornIn(db, memberItem.assetId, room);
    await bornIn(db, strangerItem.assetId, strangerRoom);

    const hostView = await svc.listGallery({ principal: principal(host), chatId: room, limit: ALL });
    expect(hostView.map((r) => r.galleryItemId)).toEqual([hostItem.galleryItemId]);
    const memberView = await svc.listGallery({ principal: principal(member), chatId: room, limit: ALL });
    expect(memberView.map((r) => r.galleryItemId)).toEqual([memberItem.galleryItemId]);
    // A principal with nothing in the room gets nothing back, whoever else curated pictures there.
    const strangerView = await svc.listGallery({ principal: principal(stranger), chatId: room, limit: ALL });
    expect(strangerView).toEqual([]);
  });

  test("room filter lists a picture once even when it carries two provenance rows in that chat", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const room = await seedChatRow(db, mintTypeId(ID_PREFIX.chat));
    const item = await addAsset(svc, owner, 1);
    await addAsset(svc, owner, 2);
    await bornIn(db, item.assetId, room);
    await bornIn(db, item.assetId, room);

    const list = await svc.listGallery({ principal: principal(owner), chatId: room, limit: ALL });
    expect(list.map((r) => r.galleryItemId)).toEqual([item.galleryItemId]);
  });
});
