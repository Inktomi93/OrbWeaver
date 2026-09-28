// verb: listGallery — gallery v2 (§1.3). Owner-scoped via the asset join (no stamped owner column),
// optional subject filter, keyset paging by (createdAt, galleryItemId). Also covers the character SET NULL
// FK: deleting the subject character nulls `subjectCharacterId` and the item survives un-charactered.

import type { GalleryItemView } from "@orb/contracts/assets";
import { characters, chatParticipants } from "@orb/db";
import type { CharacterHandle, CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AssetsService } from "@orb/server/domain/assets";
import { createAssetsService } from "@orb/server/domain/assets";
import { and, eq } from "drizzle-orm";
import { describe, onTestFinished } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, pngBytes, principal, row, seedCharacter, seedChatRow, seedMessage, seedMessageAsset, seedParticipant, seedUser } from "../_support.ts";

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

  test("room filter requires an actual linked post and present membership, while All rooms stays owner-scoped", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("room-owner") });
    const other = await seedUser(db, { handle: castId<Handle>("room-other") });
    const room = await seedChatRow(db, "chat_gallery_room");
    const elsewhere = await seedChatRow(db, "chat_gallery_elsewhere");
    await seedParticipant(db, room, "human", { userId: owner, role: "host" });
    await seedParticipant(db, elsewhere, "human", { userId: other, role: "host" });
    const posted = await addAsset(svc, owner, 31);
    const postedSecond = await addAsset(svc, owner, 34);
    const unposted = await addAsset(svc, owner, 32);
    const foreign = await addAsset(svc, other, 33);
    const roomMessage = await seedMessage(db, room, { id: "message_gallery_room" });
    const roomMessageSecond = await seedMessage(db, room, { id: "message_gallery_room_second", seq: 1 });
    const elsewhereMessage = await seedMessage(db, elsewhere, { id: "message_gallery_elsewhere" });
    await seedMessageAsset(db, roomMessage, posted.assetId);
    await seedMessageAsset(db, roomMessageSecond, postedSecond.assetId);
    await seedMessageAsset(db, elsewhereMessage, unposted.assetId);
    await seedMessageAsset(db, elsewhereMessage, foreign.assetId);

    const roomItems = await svc.listGallery({ principal: principal(owner), limit: ALL, chatId: room });
    expect(new Set(roomItems.map((item) => item.galleryItemId))).toEqual(new Set([posted.galleryItemId, postedSecond.galleryItemId]));
    const firstPage = await svc.listGallery({ principal: principal(owner), limit: 1, chatId: room });
    const cursor = row(firstPage, 0);
    const secondPage = await svc.listGallery({ principal: principal(owner), limit: 1, chatId: room, cursor: cursor.createdAt, cursorId: cursor.galleryItemId });
    expect(new Set([...firstPage, ...secondPage].map((item) => item.galleryItemId))).toEqual(new Set([posted.galleryItemId, postedSecond.galleryItemId]));
    expect(await svc.listGallery({ principal: principal(owner), limit: ALL, chatId: elsewhere })).toEqual([]);
    expect(new Set((await svc.listGallery({ principal: principal(owner), limit: ALL })).map((item) => item.galleryItemId))).toEqual(
      new Set([posted.galleryItemId, postedSecond.galleryItemId, unposted.galleryItemId]),
    );
    await db
      .update(chatParticipants)
      .set({ leftSeq: 1 })
      .where(and(eq(chatParticipants.chatId, room), eq(chatParticipants.userId, owner)));
    expect(await svc.listGallery({ principal: principal(owner), limit: ALL, chatId: room })).toEqual([]);
  });
});
