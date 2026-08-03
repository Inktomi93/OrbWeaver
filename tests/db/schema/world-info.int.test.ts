// .int tests for schema/world-info — the books/entries store + the four scope junctions (D23/D28/D32).
// Real libSQL :memory: via freshDb (FK PRAGMA ON). Covers: world_books insert→select round-trip (ownerId
// KEEP — D23, role default, createdAt epoch-ms number); world_entries round-trip (NO ownerId — owned via
// book, the always-on defaults, keys nullable-list); the world_entries.metadata JSON round-trip
// ({scopeMode, position, inject{depth,role}}) read via the @orb/kit/world-info resolvers AND the @orb/db/kit
// seam (confirming the three knobs live in JSON, NOT columns); the role enum test-mirror + CHECK on both
// world_books and character_books; each scope junction's FK + CASCADE (delete a book → entries + all four
// junctions vanish; delete the scope target → that target's junction rows vanish); and that character_books
// keys on characters.id (D28 — live identity, no cv).

import type { EntryMetadata } from "@orb/contracts/world-info";
import { WORLD_BOOK_ROLES } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import { characterBooks, characters, chatBooks, chats, globalBooks, personaBooks, personas, users, worldBooks, worldEntries } from "@orb/db";
import { isConstraintViolation, parseRecord, parseStringArrayColumn } from "@orb/db/kit";
import type { CharacterHandle, CharacterId, ChatId, PersonaId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { resolveEntryInjection, resolveEntryPosition, resolveEntryScope } from "@orb/kit/world-info";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";
import { seedChat, seedUser } from "./_support.ts";

// A non-default injection depth (named — keeps the metadata round-trip self-documenting).
const INJECT_DEPTH = 3;

async function seedBook(db: Db, ownerId: UserId, raw: string): Promise<WorldBookId> {
  const id = castId<WorldBookId>(raw);
  await db.insert(worldBooks).values({ id, ownerId, name: `book-${raw}` });
  return id;
}

async function seedEntry(db: Db, bookId: WorldBookId, raw: string): Promise<WorldEntryId> {
  const id = castId<WorldEntryId>(raw);
  await db.insert(worldEntries).values({ id, worldBookId: bookId, title: `entry-${raw}`, content: "lore body" });
  return id;
}

async function seedCharacter(db: Db, ownerId: UserId, raw: string): Promise<CharacterId> {
  const id = castId<CharacterId>(raw);
  await db.insert(characters).values({ id, handle: castId<CharacterHandle>(`card-${raw}`), ownerId, contentHash: `hash-${raw}`, name: raw });
  return id;
}

async function seedPersona(db: Db, ownerId: UserId, raw: string): Promise<PersonaId> {
  const id = castId<PersonaId>(raw);
  await db.insert(personas).values({ id, ownerId, name: raw, description: "" });
  return id;
}

// ── world_books (ownerId KEEP — D23, role default) ───────────────────────────

test("world_books insert→select round-trips (ownerId KEEP, role default, epoch-ms createdAt)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_wb_a" });
  const bookId = await seedBook(db, ownerId, "world_book_rt");

  const rows = await db.select().from(worldBooks).where(eq(worldBooks.id, bookId));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.id).toBe(bookId);
  // D23: the book references its owner DIRECTLY (KEEP ownerId — it is the partition key, not a mirror).
  expect(row?.ownerId).toBe(ownerId);
  expect(row?.name).toBe("book-world_book_rt");
  expect(row?.description).toBeNull();
  // A book has NO `role` — role is a per-character-attachment property (`character_books.role`).
  expect("role" in (row ?? {})).toBe(false);
  // Timestamps are epoch-ms NUMBERS (never Date) — born at insert.
  expect(row?.createdAt).toBeTypeOf("number");
});

// ── world_entries (NO ownerId — owned via book; defaults; nullable keys list) ──

test("world_entries round-trips with no ownerId (owned via book) + the always-on defaults", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_wb_b" });
  const bookId = await seedBook(db, ownerId, "world_book_entry");
  const entryId = await seedEntry(db, bookId, "world_entry_rt");

  const rows = await db.select().from(worldEntries).where(eq(worldEntries.id, entryId));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  expect(row?.id).toBe(entryId);
  expect(row?.worldBookId).toBe(bookId);
  expect(row?.content).toBe("lore body");
  expect(row?.enabled).toBe(true);
  expect(row?.priority).toBe(0);
  expect(row?.ignoreBudget).toBe(false);
  // `keys` is the NULLABLE list (absent ⇒ null, distinct from `[]`) — the parseStringArrayColumn asymmetry.
  expect(row?.keys).toBeNull();
  expect(parseStringArrayColumn(row?.keys)).toBeNull();
  expect(row?.metadata).toBeNull();
  // D23: an entry carries NO ownerId — its owner is reached via worldBookId → worldBooks.ownerId.
  expect(Object.keys(row ?? {})).not.toContain("ownerId");
});

test("world_entries.keys round-trips as a list when set", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_wb_keys" });
  const bookId = await seedBook(db, ownerId, "world_book_keys");
  const entryId = castId<WorldEntryId>("world_entry_keys");
  await db.insert(worldEntries).values({
    id: entryId,
    worldBookId: bookId,
    title: "keyed",
    content: "fires on match",
    keys: ["dragon", "north"],
  });

  const row = (await db.select().from(worldEntries).where(eq(worldEntries.id, entryId)))[0];
  expect(parseStringArrayColumn(row?.keys)).toEqual(["dragon", "north"]);
});

// ── world_entries.metadata JSON (scopeMode/position/inject — JSON, NOT columns) ──

test("world_entries.metadata round-trips {scopeMode, position, inject} via the kit resolvers", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_wb_meta" });
  const bookId = await seedBook(db, ownerId, "world_book_meta");
  // The three per-entry knobs live INSIDE metadata (D32 inject = the shared {depth, role} directive) — they
  // are NOT db columns. EntryMetadata composes the @orb/kit tuples DOWN.
  const metadata = {
    scopeMode: "keyword",
    position: "after",
    inject: { depth: INJECT_DEPTH, role: "system" },
  } satisfies EntryMetadata;
  const entryId = castId<WorldEntryId>("world_entry_meta");
  await db.insert(worldEntries).values({
    id: entryId,
    worldBookId: bookId,
    title: "metad",
    content: "lore",
    metadata,
  });

  const row = (await db.select().from(worldEntries).where(eq(worldEntries.id, entryId)))[0];
  // The typed read (drizzle hands back the parsed object as-is).
  expect(row?.metadata).toEqual(metadata);
  // The @orb/db/kit read-seam parser round-trips the blob as a Record (the §8.4 parse-at-the-DB-seam model).
  expect(parseRecord(row?.metadata)).toEqual(metadata);
  // The @orb/kit/world-info resolvers read each knob OUT of the JSON blob (the real consumer path).
  expect(resolveEntryScope(row?.metadata, false)).toBe("keyword");
  expect(resolveEntryPosition(row?.metadata)).toBe("after");
  expect(resolveEntryInjection(row?.metadata)).toEqual({ depth: INJECT_DEPTH, role: "system" });
});

// ── the character-attachment `role` enum (test-mirror + CHECK) ───────────────

test("test-mirror: character_books.role derives WORLD_BOOK_ROLES", () => {
  // role lives ONLY on the character attachment (BookAttachmentView), not on the book.
  expect([...characterBooks.role.enumValues]).toEqual([...WORLD_BOOK_ROLES]);
});

test("character_books role CHECK rejects an out-of-enum value", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_cb_badrole" });
  const bookId = await seedBook(db, ownerId, "world_book_cb_badrole");
  const characterId = await seedCharacter(db, ownerId, "character_cb_badrole");
  let caught: unknown;
  try {
    await db.insert(characterBooks).values({
      characterId,
      worldBookId: bookId,
      role: "nope" as unknown as (typeof WORLD_BOOK_ROLES)[number],
    });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
});

// ── junctions: FK + key shape (D28: character_books on characters.id) ─────────

test("character_books keys on characters.id (D28 — live identity, no cv)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_cb_key" });
  const bookId = await seedBook(db, ownerId, "world_book_cb_key");
  const characterId = await seedCharacter(db, ownerId, "character_cb_key");
  await db.insert(characterBooks).values({ characterId, worldBookId: bookId, role: "primary" });

  const row = (await db.select().from(characterBooks).where(eq(characterBooks.worldBookId, bookId)))[0];
  // The only association key is `characterId` → characters.id (the CharacterId brand survives the row).
  expect(row?.characterId).toBe(characterId);
  expect(row?.role).toBe("primary");
});

test("a junction FK rejects a dangling scope target (chat_books needs a real chat)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_fk" });
  const bookId = await seedBook(db, ownerId, "world_book_fk");
  let caught: unknown;
  try {
    await db.insert(chatBooks).values({ chatId: castId<ChatId>("chat_missing"), worldBookId: bookId });
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeDefined();
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

// ── CASCADE: delete a book → entries + ALL FOUR junctions vanish ──────────────

test("deleting a book CASCADEs its entries and all four scope junctions", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_casc" });
  const bookId = await seedBook(db, ownerId, "world_book_cascade");
  await seedEntry(db, bookId, "world_entry_cascade");

  const chatId = await seedChat(db, { id: "chat_cascade" });
  const characterId = await seedCharacter(db, ownerId, "character_cascade_wi");
  const personaId = await seedPersona(db, ownerId, "persona_cascade_wi");
  await db.insert(chatBooks).values({ chatId, worldBookId: bookId });
  await db.insert(characterBooks).values({ characterId, worldBookId: bookId });
  await db.insert(globalBooks).values({ worldBookId: bookId });
  await db.insert(personaBooks).values({ personaId, worldBookId: bookId });

  await db.delete(worldBooks).where(eq(worldBooks.id, bookId));

  expect(await db.select().from(worldEntries).where(eq(worldEntries.worldBookId, bookId))).toEqual([]);
  expect(await db.select().from(chatBooks).where(eq(chatBooks.worldBookId, bookId))).toEqual([]);
  expect(await db.select().from(characterBooks).where(eq(characterBooks.worldBookId, bookId))).toEqual([]);
  expect(await db.select().from(globalBooks).where(eq(globalBooks.worldBookId, bookId))).toEqual([]);
  expect(await db.select().from(personaBooks).where(eq(personaBooks.worldBookId, bookId))).toEqual([]);
});

// ── CASCADE: delete a scope target → that target's junction rows vanish ───────

test("deleting a scope target CASCADEs its junction rows (book survives)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_target_casc" });
  const bookId = await seedBook(db, ownerId, "world_book_target");
  const characterId = await seedCharacter(db, ownerId, "character_target");
  const personaId = await seedPersona(db, ownerId, "persona_target");
  const chatId = await seedChat(db, { id: "chat_target" });
  await db.insert(characterBooks).values({ characterId, worldBookId: bookId });
  await db.insert(personaBooks).values({ personaId, worldBookId: bookId });
  await db.insert(chatBooks).values({ chatId, worldBookId: bookId });

  await db.delete(characters).where(eq(characters.id, characterId));
  await db.delete(personas).where(eq(personas.id, personaId));
  await db.delete(chats).where(eq(chats.id, chatId));

  expect(await db.select().from(characterBooks).where(eq(characterBooks.worldBookId, bookId))).toEqual([]);
  expect(await db.select().from(personaBooks).where(eq(personaBooks.worldBookId, bookId))).toEqual([]);
  expect(await db.select().from(chatBooks).where(eq(chatBooks.worldBookId, bookId))).toEqual([]);
  // The book itself survives — the CASCADE flows target → junction, never junction → book.
  expect(await db.select().from(worldBooks).where(eq(worldBooks.id, bookId))).toHaveLength(1);
});

// ── user delete cascades owned books (D23 ownerId → users CASCADE) ────────────

test("deleting the owner CASCADEs their world_books (D23 ownerId)", async () => {
  const db = await freshDb();
  const ownerId = await seedUser(db, { id: "user_owner_casc" });
  const bookId = await seedBook(db, ownerId, "world_book_owner");
  await seedEntry(db, bookId, "world_entry_owner");

  await db.delete(users).where(eq(users.id, ownerId));

  expect(await db.select().from(worldBooks).where(eq(worldBooks.id, bookId))).toEqual([]);
  // The entry cascaded with its book.
  expect(await db.select().from(worldEntries).where(eq(worldEntries.worldBookId, bookId))).toEqual([]);
});
