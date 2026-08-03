// `createCopyHandoffBooks` — the world-info-owned lore copy the host-handoff property offer executes.
//
// The interesting claims are all about WHY it is a copy and not a carry: `character.duplicate`'s book carry
// re-points fresh junctions at the SAME books, which is right inside one library and silently wrong across
// owners (the character-book pool is owner-filtered, so a copied card pointing at foreign books reads fine
// and never fires an entry). And the ROOM half severs the chat-book license — the one posture that otherwise
// leaves a departed host able to edit, or CASCADE away, the transferred room's prompt.

import type { Db } from "@orb/db";
import { characterBooks, characters, chatBooks, worldBooks, worldEntries } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { CharacterId, ChatId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { createCopyHandoffBooks } from "../../../../../packages/server/src/domain/world-info";
import { freshDb } from "../../../../support/db";
import { seedChat } from "../../../../support/factories/chat";
import { seedUser } from "../../../../support/factories/user";
import { expect, test } from "../../../../support/fixtures";

const AT = 1_700_000_000_000;

async function seedCard(db: Db, ownerId: UserId, key: string): Promise<CharacterId> {
  const id = castId<CharacterId>(`character_${key}`);
  await db.insert(characters).values({ id, ownerId, handle: key, name: key, contentHash: key, tokenSize: 0, createdAt: AT });
  return id;
}

async function seedBook(db: Db, ownerId: UserId, key: string, entries: readonly string[] = []): Promise<WorldBookId> {
  const id = castId<WorldBookId>(`world_book_${key}`);
  await db.insert(worldBooks).values({ id, ownerId, name: key, description: null, createdAt: AT });
  for (const [i, content] of entries.entries()) {
    // biome-ignore lint/performance/noAwaitInLoops: a tiny seed set, written in order so entry ids stay predictable.
    await db.insert(worldEntries).values({ id: castId<WorldEntryId>(`world_entry_${key}_${i}`), worldBookId: id, title: `t${i}`, content, createdAt: AT });
  }
  return id;
}

function copier(db: Db): ReturnType<typeof createCopyHandoffBooks> {
  let n = 0;
  return createCopyHandoffBooks({
    db,
    now: () => AT,
    newBookId: (): WorldBookId => {
      n += 1;
      return castId<WorldBookId>(`world_book_copy_${n}`);
    },
    newEntryId: (): WorldEntryId => {
      n += 1;
      return castId<WorldEntryId>(`world_entry_copy_${n}`);
    },
  });
}

test("a card's attached book is copied BY VALUE onto the card copy, entries and role intact", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const chatId = (await seedChat(db)).id;
  const source = await seedCard(db, oldHost.id, "aria");
  const copy = await seedCard(db, nominee.id, "aria_copy");
  const book = await seedBook(db, oldHost.id, "lore", ["the secret", "the other secret"]);
  await db.insert(characterBooks).values({ characterId: source, worldBookId: book, role: "primary", createdAt: AT });

  await copier(db)({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId, cardCopies: [{ sourceCharacterId: source, characterId: copy }] });

  const copied = await db.select().from(worldBooks).where(eq(worldBooks.ownerId, nominee.id));
  expect(copied).toHaveLength(1);
  const entries = await db
    .select()
    .from(worldEntries)
    .where(eq(worldEntries.worldBookId, copied[0]?.id ?? book));
  expect(entries.map((e) => e.content).sort()).toEqual(["the other secret", "the secret"]);
  const junction = (await db.select().from(characterBooks).where(eq(characterBooks.characterId, copy)))[0];
  expect(junction?.worldBookId).toBe(copied[0]?.id);
  expect(junction?.role).toBe("primary");
});

test("a book on the seated card that the DEPARTING host does not own is skipped (a junction is not a license)", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const stranger = await seedUser(db, { handle: castId("stranger") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const chatId = (await seedChat(db)).id;
  const source = await seedCard(db, oldHost.id, "aria");
  const copy = await seedCard(db, nominee.id, "aria_copy");
  const mine = await seedBook(db, oldHost.id, "mine", ["ok"]);
  const theirs = await seedBook(db, stranger.id, "theirs", ["private"]);
  await db.insert(characterBooks).values([
    { characterId: source, worldBookId: mine, role: "primary", createdAt: AT },
    { characterId: source, worldBookId: theirs, role: "auxiliary", createdAt: AT },
  ]);

  await copier(db)({ fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId, cardCopies: [{ sourceCharacterId: source, characterId: copy }] });

  // Exactly ONE book copied — the stranger's lore was never the departing host's to give away.
  const copied = await db.select().from(worldBooks).where(eq(worldBooks.ownerId, nominee.id));
  expect(copied).toHaveLength(1);
  expect(copied[0]?.name).toBe("mine");
  expect(await db.select().from(characterBooks).where(eq(characterBooks.characterId, copy))).toHaveLength(1);
});

test("a book attached to TWO seated cards becomes ONE shared copy, exactly as the originals shared it", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const chatId = (await seedChat(db)).id;
  const a = await seedCard(db, oldHost.id, "a");
  const b = await seedCard(db, oldHost.id, "b");
  const copyA = await seedCard(db, nominee.id, "a_copy");
  const copyB = await seedCard(db, nominee.id, "b_copy");
  const shared = await seedBook(db, oldHost.id, "shared", ["world truth"]);
  await db.insert(characterBooks).values([
    { characterId: a, worldBookId: shared, role: "primary", createdAt: AT },
    { characterId: b, worldBookId: shared, role: "primary", createdAt: AT },
  ]);

  await copier(db)({
    fromOwnerId: oldHost.id,
    toOwnerId: nominee.id,
    chatId,
    cardCopies: [
      { sourceCharacterId: a, characterId: copyA },
      { sourceCharacterId: b, characterId: copyB },
    ],
  });

  const copied = await db.select().from(worldBooks).where(eq(worldBooks.ownerId, nominee.id));
  // ONE book, not two: a per-card mint would silently fork the room's lore into divergent duplicates.
  expect(copied).toHaveLength(1);
  const junctions = await db
    .select()
    .from(characterBooks)
    .where(eq(characterBooks.worldBookId, copied[0]?.id ?? shared));
  expect(junctions.map((j) => j.characterId).sort()).toEqual([copyA, copyB].sort());
  // …and its entries were copied ONCE.
  expect(
    await db
      .select()
      .from(worldEntries)
      .where(eq(worldEntries.worldBookId, copied[0]?.id ?? shared)),
  ).toHaveLength(1);
});

test("the ROOM's attached book is re-pointed at a copy — returned UNEXECUTED, so it rides the swap batch", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const chatId = (await seedChat(db)).id;
  const source = await seedCard(db, oldHost.id, "aria");
  const copy = await seedCard(db, nominee.id, "aria_copy");
  const roomBook = await seedBook(db, oldHost.id, "room", ["room truth"]);
  await db.insert(chatBooks).values({ chatId, worldBookId: roomBook, createdAt: AT });

  const repoint = await copier(db)({
    fromOwnerId: oldHost.id,
    toOwnerId: nominee.id,
    chatId,
    cardCopies: [{ sourceCharacterId: source, characterId: copy }],
  });

  // The BOOK landed already (orphan-safe, ahead of the swap) but the room still reads the original — the
  // attachment is room state and moves only when chat commits its batch.
  expect((await db.select().from(chatBooks).where(eq(chatBooks.chatId, chatId)))[0]?.worldBookId).toBe(roomBook);
  await db.batch(batchMany(repoint as BatchStmt[]));

  const attached = await db.select().from(chatBooks).where(eq(chatBooks.chatId, chatId));
  expect(attached).toHaveLength(1);
  expect(
    (
      await db
        .select()
        .from(worldBooks)
        .where(eq(worldBooks.id, attached[0]?.worldBookId ?? roomBook))
    )[0]?.ownerId,
  ).toBe(nominee.id);
  // The departed host keeps their own book; it just no longer fires into this room.
  expect((await db.select().from(worldBooks).where(eq(worldBooks.id, roomBook)))[0]?.ownerId).toBe(oldHost.id);
});

test("a RETRIED accept copies nothing twice — a card copy that already carries junctions is left alone", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const chatId = (await seedChat(db)).id;
  const source = await seedCard(db, oldHost.id, "aria");
  const copy = await seedCard(db, nominee.id, "aria_copy");
  const book = await seedBook(db, oldHost.id, "lore", ["the secret"]);
  await db.insert(characterBooks).values({ characterId: source, worldBookId: book, role: "primary", createdAt: AT });
  const copyBooks = copier(db);
  const args = { fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId, cardCopies: [{ sourceCharacterId: source, characterId: copy }] };

  await copyBooks(args);
  await copyBooks(args);

  expect(await db.select().from(worldBooks).where(eq(worldBooks.ownerId, nominee.id))).toHaveLength(1);
  expect(await db.select().from(characterBooks).where(eq(characterBooks.characterId, copy))).toHaveLength(1);
});

test("a RETRIED room re-point converges on the book the recipient already owns on this chat", async () => {
  const db = await freshDb();
  const oldHost = await seedUser(db, { handle: castId("oldhost") });
  const nominee = await seedUser(db, { handle: castId("nominee") });
  const chatId: ChatId = (await seedChat(db)).id;
  const roomBook = await seedBook(db, oldHost.id, "room", ["room truth"]);
  await db.insert(chatBooks).values({ chatId, worldBookId: roomBook, createdAt: AT });
  const copyBooks = copier(db);
  const args = { fromOwnerId: oldHost.id, toOwnerId: nominee.id, chatId, cardCopies: [] };

  // First attempt: the copy lands, the re-point is committed.
  await db.batch(batchMany((await copyBooks(args)) as BatchStmt[]));
  // The retry sees the original detached already, so there is nothing left to copy — and the room keeps ONE
  // attachment rather than accumulating a second identical book on every re-run.
  await db.batch(batchMany([...((await copyBooks(args)) as BatchStmt[]), db.update(worldBooks).set({ name: "room" }).where(eq(worldBooks.id, roomBook))]));

  expect(await db.select().from(chatBooks).where(eq(chatBooks.chatId, chatId))).toHaveLength(1);
  expect(await db.select().from(worldBooks).where(eq(worldBooks.ownerId, nominee.id))).toHaveLength(1);
});
