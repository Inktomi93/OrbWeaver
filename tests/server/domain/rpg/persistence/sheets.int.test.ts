// persistence/sheets — the per-actor identity store backing the roster ∪ rows projection (rpg-design/05
// §4.3). .int: real FK. NO membership shadow — a sheet is keyed by durable actor identity, created on FIRST
// WRITE. The projection itself (roster ∪ rows, default-for-missing, retained-not-projected) is composed in
// W1b's verb; this suite proves the persistence PRIMITIVES that make it possible, and demonstrates the
// derivation inline so the semantics are pinned.

import type { RpgSheet } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import type { CharacterId, RpgSheetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { findSheet, listSheets, upsertSheet } from "../../../../../packages/server/src/domain/rpg/persistence/sheets";
import { freshDb } from "../../../../support/db";
import { expect, FROZEN_AT, seedCharacter, seedChat, seedGame, seedUser, test } from "../_support";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

const DEFAULT_SHEET: RpgSheet = { className: "", attributes: {}, poolDefs: [], maxHp: null, flavor: "" };

function sheetWith(className: string): RpgSheet {
  return { className, attributes: { str: 3 }, poolDefs: [], maxHp: null, flavor: "" };
}

function seedChar(userId: UserId, key: string): Promise<CharacterId> {
  return seedCharacter(db, userId, key);
}

describe("row-on-first-write", () => {
  test("findSheet returns undefined for an actor with no row (⇒ the verb renders the DEFAULT sheet)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const owner = await seedUser(db, "owner");
    const charId = await seedChar(owner, "aria");
    expect(await findSheet(db, gameId, { characterId: charId })).toBeUndefined();
  });

  test("upsertSheet creates on first write, overwrites on the second (one row per actor)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const owner = await seedUser(db, "owner");
    const charId = await seedChar(owner, "aria");

    const created = await upsertSheet(db, {
      id: castId<RpgSheetId>("rpg_sheet_1"),
      gameId,
      characterId: charId,
      userId: null,
      sheet: sheetWith("rogue"),
      now: FROZEN_AT,
    });
    expect(created.sheet.className).toBe("rogue");

    const updated = await upsertSheet(db, {
      id: castId<RpgSheetId>("rpg_sheet_2"),
      gameId,
      characterId: charId,
      userId: null,
      sheet: sheetWith("mage"),
      now: FROZEN_AT,
    });
    expect(updated.sheet.className).toBe("mage");
    // Still exactly ONE row (the second upsert overwrote, never inserted a duplicate).
    expect(await listSheets(db, gameId)).toHaveLength(1);
  });
});

describe("the roster ∪ rows projection (derivation pinned inline)", () => {
  test("a roster actor WITHOUT a row projects the DEFAULT sheet; one WITH a row projects its data", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const owner = await seedUser(db, "owner");
    const withRow = await seedChar(owner, "aria");
    const withoutRow = await seedChar(owner, "bram");
    await upsertSheet(db, { id: castId<RpgSheetId>("rpg_sheet_aria"), gameId, characterId: withRow, userId: null, sheet: sheetWith("rogue"), now: FROZEN_AT });

    // The verb's projection: for each roster actor, its row's sheet OR the default.
    const roster: readonly CharacterId[] = [withRow, withoutRow];
    const rows = await listSheets(db, gameId);
    const byChar = new Map(rows.filter((r) => r.characterId !== null).map((r) => [r.characterId, r.sheet]));
    const projected = roster.map((id) => byChar.get(id) ?? DEFAULT_SHEET);

    expect(projected[0]?.className).toBe("rogue");
    expect(projected[1]).toEqual(DEFAULT_SHEET);
  });

  test("a departed actor's row is RETAINED in persistence but NOT projected (off the roster)", async () => {
    const chatId = await seedChat(db, "a");
    const gameId = await seedGame(db, chatId);
    const owner = await seedUser(db, "owner");
    const present = await seedChar(owner, "aria");
    const departed = await seedChar(owner, "ghost");
    await upsertSheet(db, { id: castId<RpgSheetId>("rpg_sheet_aria"), gameId, characterId: present, userId: null, sheet: sheetWith("rogue"), now: FROZEN_AT });
    await upsertSheet(db, {
      id: castId<RpgSheetId>("rpg_sheet_ghost"),
      gameId,
      characterId: departed,
      userId: null,
      sheet: sheetWith("cleric"),
      now: FROZEN_AT,
    });

    // The departed actor is off the current roster; the projection keys on the roster, so it drops out —
    // but the row survives (presence gates the write, the read derives).
    const roster: readonly CharacterId[] = [present];
    const rows = await listSheets(db, gameId);
    expect(rows).toHaveLength(2); // retained
    const byChar = new Map(rows.filter((r) => r.characterId !== null).map((r) => [r.characterId, r.sheet]));
    const projected = roster.map((id) => byChar.get(id) ?? DEFAULT_SHEET);
    expect(projected).toHaveLength(1); // not projected
    expect(projected[0]?.className).toBe("rogue");
  });
});
