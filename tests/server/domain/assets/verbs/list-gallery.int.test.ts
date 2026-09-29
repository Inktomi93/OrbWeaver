// verb: listGallery — gallery v2 (§1.3). Owner-scoped via the asset join (no stamped owner column),
// optional subject and room filters, keyset paging by (createdAt, galleryItemId) in both date orders. Also
// covers the character SET NULL FK: deleting the subject character nulls `subjectCharacterId`.

import type { GalleryCursor, GalleryItemView, GallerySort } from "@orb/contracts/assets";
import { ASSET_LIST_LIMIT_MAX, GALLERY_SORTS } from "@orb/contracts/assets";
import type { Db } from "@orb/db";
import { characters, imageryGenerations } from "@orb/db";
import type { AssetId, CharacterHandle, CharacterId, ChatId, GalleryItemId, Handle, UserId } from "@orb/kit/ids";
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
/** One byte of the PNG tail holds 0..255; a larger picture number spans two. */
const BYTE_SPAN = 256;

async function addAsset(svc: AssetsService, owner: UserId, tail: number, subjectCharacterId?: CharacterId): Promise<GalleryItemView> {
  const asset = await svc.store({
    principal: principal(owner),
    bytes: pngBytes(Math.floor(tail / BYTE_SPAN), tail % BYTE_SPAN),
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

/** The cursor that continues a read after `item` — the last row of the page just read. */
function cursorAfter(item: GalleryItemView): GalleryCursor {
  return { createdAt: item.createdAt, galleryItemId: item.galleryItemId };
}

/** More pages than any walk here needs; a walk that reaches it is a cursor that stopped advancing. */
const WALK_PAGE_CEILING = 200;

/** Walk every page of `owner`'s gallery in `sort` order, `limit` rows at a time; returns the pages. */
async function walkPages(svc: AssetsService, owner: UserId, sort: GallerySort, limit: number): Promise<GalleryItemView[][]> {
  const pages: GalleryItemView[][] = [];
  let cursor: GalleryCursor | undefined;
  while (pages.length < WALK_PAGE_CEILING) {
    const page = await svc.listGallery({ principal: principal(owner), limit, sort, ...(cursor === undefined ? {} : { cursor }) });
    pages.push(page);
    const last = page.at(-1);
    if (page.length < limit || last === undefined) {
      return pages;
    }
    cursor = cursorAfter(last);
  }
  throw new Error(`the ${sort} walk did not reach a short page in ${String(WALK_PAGE_CEILING)} pages: the cursor is not advancing`);
}

/** The `(createdAt, id)` order a sort promises, computed apart from the query: SQLite compares TEXT bytewise,
 *  and these ids are ASCII, so a plain string comparison agrees with it. */
function expectedOrder(items: readonly GalleryItemView[], sort: GallerySort): GalleryItemId[] {
  const ascending = [...items].sort((x, y) => x.createdAt - y.createdAt || (x.galleryItemId < y.galleryItemId ? -1 : 1));
  const ids = ascending.map((item) => item.galleryItemId);
  return sort === "oldest" ? ids : ids.reverse();
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
      cursor: cursorAfter(c1),
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

// Past one wire page: 150 pictures at limit 100 are two pages, and the second continues where the first
// stopped. Every fifth picture shares its predecessor's instant, so ties straddle the pages too.
const MANY = 150;
const TIE_EVERY = 5;

describe("listGallery — paging and date order", () => {
  for (const sort of GALLERY_SORTS) {
    test(`${sort}: a gallery past ${String(ASSET_LIST_LIMIT_MAX)} pictures pages to the end with no skip or repeat`, async () => {
      const db = await freshDb();
      const h = await makeHarness(db);
      onTestFinished(h.cleanup);
      const svc = createAssetsService(h.ctx);
      const owner = await seedUser(db, { handle: castId<Handle>("owner") });
      const added: GalleryItemView[] = [];
      for (let i = 0; i < MANY; i += 1) {
        if (i % TIE_EVERY !== 0) {
          h.advance(1);
        }
        added.push(await addAsset(svc, owner, i));
      }

      const pages = await walkPages(svc, owner, sort, ASSET_LIST_LIMIT_MAX);
      expect(pages.map((page) => page.length)).toEqual([ASSET_LIST_LIMIT_MAX, MANY - ASSET_LIST_LIMIT_MAX]);
      expect(pages.flat().map((item) => item.galleryItemId)).toEqual(expectedOrder(added, sort));
    });
  }

  test("equal createdAt: the id breaks the tie, the same way on every read and at every page size", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    // The frozen clock stamps every row with one instant: the order is the id alone.
    const added = [await addAsset(svc, owner, 0), await addAsset(svc, owner, 1), await addAsset(svc, owner, 2), await addAsset(svc, owner, 3)];
    expect(new Set(added.map((item) => item.createdAt)).size).toBe(1);

    for (const sort of GALLERY_SORTS) {
      const whole = (await svc.listGallery({ principal: principal(owner), limit: ALL, sort })).map((item) => item.galleryItemId);
      expect(whole).toEqual(expectedOrder(added, sort));
      // One row per page: every page boundary falls inside the tie, and the walk still reads the same list.
      expect((await walkPages(svc, owner, sort, 1)).flat().map((item) => item.galleryItemId)).toEqual(whole);
    }
  });

  test("newest and oldest are the two date orders, and an unnamed sort is newest", async () => {
    const db = await freshDb();
    const h = await makeHarness(db);
    onTestFinished(h.cleanup);
    const svc = createAssetsService(h.ctx);
    const owner = await seedUser(db, { handle: castId<Handle>("owner") });
    const first = await addAsset(svc, owner, 1);
    h.advance(1000);
    const second = await addAsset(svc, owner, 2);
    h.advance(1000);
    const third = await addAsset(svc, owner, 3);

    const ids = async (sort?: GallerySort): Promise<GalleryItemId[]> =>
      (await svc.listGallery({ principal: principal(owner), limit: ALL, ...(sort === undefined ? {} : { sort }) })).map((item) => item.galleryItemId);
    expect(await ids("newest")).toEqual([third.galleryItemId, second.galleryItemId, first.galleryItemId]);
    expect(await ids("oldest")).toEqual([first.galleryItemId, second.galleryItemId, third.galleryItemId]);
    expect(await ids()).toEqual(await ids("newest"));
  });

  for (const sort of GALLERY_SORTS) {
    test(`${sort}: every page stays in the caller's gallery, and another owner's cursor reads only the caller's rows`, async () => {
      const db = await freshDb();
      const h = await makeHarness(db);
      onTestFinished(h.cleanup);
      const svc = createAssetsService(h.ctx);
      const a = await seedUser(db, { handle: castId<Handle>("a") });
      const b = await seedUser(db, { handle: castId<Handle>("b") });
      // Interleaved in time, so B's rows sit between A's in the shared keyset.
      const aItems: GalleryItemView[] = [];
      const bItems: GalleryItemView[] = [];
      for (let i = 0; i < 6; i += 1) {
        h.advance(1);
        aItems.push(await addAsset(svc, a, i));
        h.advance(1);
        bItems.push(await addAsset(svc, b, i));
      }

      const aWalk = (await walkPages(svc, a, sort, PAGE)).flat().map((item) => item.galleryItemId);
      expect(aWalk).toEqual(expectedOrder(aItems, sort));
      // A cursor lifted from A's list gives B none of A's rows: only B's rows past that instant, in B's order.
      const aMiddle = row(aItems, 2);
      const bAfter = await svc.listGallery({ principal: principal(b), limit: ALL, sort, cursor: cursorAfter(aMiddle) });
      const pastMiddle = (item: GalleryItemView): boolean => (sort === "newest" ? item.createdAt < aMiddle.createdAt : item.createdAt > aMiddle.createdAt);
      expect(bAfter.map((item) => item.galleryItemId)).toEqual(expectedOrder(bItems.filter(pastMiddle), sort));
    });
  }
});
