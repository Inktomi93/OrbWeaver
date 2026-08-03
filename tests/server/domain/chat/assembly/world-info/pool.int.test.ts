// assembly/world-info/pool — the 4-scope WI union (chat.md Part I 8-slot; Part II §2 GATHER). Pins: the
// chat/character/global/persona union, dedup by entry id (a book attached at two scopes renders once), the
// host-owner scoping of global books (a foreign tenant's global book never leaks), the source tagging
// (character → "character"; chat/persona/global → "chat"), the scope resolution (keys → keyword, keyless →
// always), and the emergent no-lore path (nothing attached ⇒ empty pool — no master toggle, ST parity).
import type { Db } from "@orb/db";
import { characterBooks, chatBooks, globalBooks, personaBooks, personas, worldBooks, worldEntries } from "@orb/db";
import type { Handle, PersonaId, UserId, WorldBookId, WorldEntryId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { loadWorldInfoPool } from "../../../../../../packages/server/src/domain/chat/assembly/world-info/pool";
import { freshDb } from "../../../../../support/db";
import { expect, test } from "../../../../../support/fixtures";
import { FROZEN_AT, seedCharacter, seedChat, seedUser } from "../../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

async function seedPersona(owner: UserId, key: string): Promise<PersonaId> {
  const id = castId<PersonaId>(`persona_${key}`);
  await db.insert(personas).values({
    id,
    ownerId: owner,
    name: key,
    description: `${key} desc`,
    createdAt: FROZEN_AT,
    updatedAt: FROZEN_AT,
  });
  return id;
}

/** Insert a book + one entry; returns the book id. `keys` non-empty ⇒ the entry resolves keyword-scope. */
async function seedBook(owner: UserId, key: string, entry: { content: string; keys?: string[] }): Promise<WorldBookId> {
  const bookId = castId<WorldBookId>(`world_book_${key}`);
  await db.insert(worldBooks).values({ id: bookId, ownerId: owner, name: key, createdAt: FROZEN_AT });
  await db.insert(worldEntries).values({
    id: castId<WorldEntryId>(`world_entry_${key}`),
    worldBookId: bookId,
    title: key,
    content: entry.content,
    keys: entry.keys ?? null,
    enabled: true,
    priority: 0,
    ignoreBudget: false,
    metadata: null,
    createdAt: FROZEN_AT,
  });
  return bookId;
}

describe("loadWorldInfoPool — the 4-scope union", () => {
  test("unions chat + character + global(host) + persona books, owner-scoping global, dedup by id", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const other = await seedUser(db, castId<Handle>("other"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const personaId = await seedPersona(host, "nyx");

    const chatBook = await seedBook(host, "chat", { content: "chat lore", keys: ["castle"] });
    const charBook = await seedBook(host, "char", { content: "char lore" });
    const globalBook = await seedBook(host, "glob", { content: "global lore" });
    const personaBook = await seedBook(host, "pers", { content: "persona lore" });
    // A foreign tenant's global book — must NOT surface for this host.
    const foreignGlobal = await seedBook(other, "foreign", { content: "foreign lore" });

    await db.insert(chatBooks).values({ chatId, worldBookId: chatBook, createdAt: FROZEN_AT });
    await db.insert(characterBooks).values({
      characterId: charId,
      worldBookId: charBook,
      role: "auxiliary",
      createdAt: FROZEN_AT,
    });
    await db.insert(globalBooks).values({ worldBookId: globalBook, createdAt: FROZEN_AT });
    await db.insert(globalBooks).values({ worldBookId: foreignGlobal, createdAt: FROZEN_AT });
    await db.insert(personaBooks).values({ personaId, worldBookId: personaBook, createdAt: FROZEN_AT });

    const pool = await loadWorldInfoPool(db, {
      chatId,
      ownerId: host,
      castCharacterIds: [charId],
      personaIds: [personaId],
    });
    const contents = pool.map((e) => e.content).sort();
    expect(contents).toEqual(["char lore", "chat lore", "global lore", "persona lore"]);
    // The foreign tenant's global book is owner-scoped out.
    expect(contents).not.toContain("foreign lore");

    // Source tagging (dual-persona routing): character → "character"; the rest → "chat".
    const bySource = Object.fromEntries(pool.map((e) => [e.content, e.source]));
    expect(bySource["char lore"]).toBe("character");
    expect(bySource["chat lore"]).toBe("chat");
    expect(bySource["persona lore"]).toBe("chat");
    expect(bySource["global lore"]).toBe("chat");

    // Scope resolution: keys present → keyword; keyless → always.
    const byScope = Object.fromEntries(pool.map((e) => [e.content, e.scope]));
    expect(byScope["chat lore"]).toBe("keyword");
    expect(byScope["char lore"]).toBe("always");
  });

  test("a book attached at two scopes (chat + character) renders its entry ONCE (dedup)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const charId = await seedCharacter(db, host, "aria");
    const shared = await seedBook(host, "shared", { content: "shared lore" });
    await db.insert(chatBooks).values({ chatId, worldBookId: shared, createdAt: FROZEN_AT });
    await db.insert(characterBooks).values({
      characterId: charId,
      worldBookId: shared,
      role: "auxiliary",
      createdAt: FROZEN_AT,
    });

    const pool = await loadWorldInfoPool(db, {
      chatId,
      ownerId: host,
      castCharacterIds: [charId],
      personaIds: [],
    });
    expect(pool.filter((e) => e.content === "shared lore")).toHaveLength(1);
  });

  test("nothing attached → empty pool (emergent: no books ⇒ no lore, ST parity — no master toggle)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const chatId = await seedChat(db, "a");
    const pool = await loadWorldInfoPool(db, {
      chatId,
      ownerId: host,
      castCharacterIds: [],
      personaIds: [],
    });
    expect(pool).toEqual([]);
  });
});
