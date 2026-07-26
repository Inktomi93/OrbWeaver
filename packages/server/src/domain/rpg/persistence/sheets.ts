// domain/rpg/persistence/sheets — the per-actor IDENTITY sheet store (rpg-design/05 §4.3). NO membership
// shadow (the no-party-system ruling made schema: `rpg_sheets` replaces legacy `rpg_party`). A sheet is
// keyed by durable actor identity (characterId XOR userId), created on FIRST WRITE. This slot owns the READ
// (raw rows + a by-actor lookup) and the row-on-first-write UPSERT; the roster ∪ rows PROJECTION is composed
// in the verb layer (W1b) against the injected roster — persistence never reads the chat roster (that's the
// auth chokepoint's op). `sheet` is parse-on-read through the contract schema.
//
// The row is subordinate to its actor's identity (CASCADE on character/user hard-delete). A sheet whose
// actor merely LEFT the roster is retained-not-projected — persistence keeps the row; the verb's projection
// drops it from the view (presence gates the write, the read derives).

import type { RpgSheet } from "@orb/contracts/rpg";
import { rpgSheetSchema } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { rpgSheets } from "@orb/db";
import type { CharacterId, RpgGameId, RpgSheetId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import { RpgStateCorruptError } from "../contract/errors";
import type { RpgSheetRow } from "../contract/service";

/** Re-validate a sheet row's `sheet` JSON through its contract schema (parse-on-read). */
function parseSheetRow(row: RpgSheetRow): RpgSheetRow {
  const parsed = rpgSheetSchema.safeParse(row.sheet);
  if (!parsed.success) {
    throw new RpgStateCorruptError("rpg_sheets", row.id, `sheet: ${parsed.error.message}`);
  }
  return { ...row, sheet: parsed.data };
}

/** All sheet rows for a game (parsed) — the verb layer projects these against the roster (roster ∪ rows). */
export async function listSheets(db: Db, gameId: RpgGameId): Promise<readonly RpgSheetRow[]> {
  const rows = await db.select().from(rpgSheets).where(eq(rpgSheets.gameId, gameId));
  return rows.map(parseSheetRow);
}

/** One actor's sheet row (character XOR user), parsed, or `undefined` (⇒ the verb renders the DEFAULT sheet). */
export async function findSheet(
  db: Db,
  gameId: RpgGameId,
  actor: { readonly characterId: CharacterId } | { readonly userId: UserId },
): Promise<RpgSheetRow | undefined> {
  const cond = "characterId" in actor ? eq(rpgSheets.characterId, actor.characterId) : eq(rpgSheets.userId, actor.userId);
  const rows = await db
    .select()
    .from(rpgSheets)
    .where(and(eq(rpgSheets.gameId, gameId), cond))
    .limit(1);
  return rows[0] ? parseSheetRow(rows[0]) : undefined;
}

/** Row-on-first-write: create the sheet row if the actor has none, else overwrite its `sheet` blob (the verb
 *  composes the MA-4 patch before calling — persistence writes the resolved sheet). `id`/`now` injected. */
export async function upsertSheet(
  db: Db,
  input: {
    readonly id: RpgSheetId;
    readonly gameId: RpgGameId;
    readonly characterId: CharacterId | null;
    readonly userId: UserId | null;
    readonly sheet: RpgSheet;
    readonly now: number;
  },
): Promise<RpgSheetRow> {
  // The XOR (characterId XOR userId) is DB-enforced; exactly one is non-null.
  const actor = input.characterId !== null ? { characterId: input.characterId } : { userId: input.userId as UserId };
  const existing = await findSheet(db, input.gameId, actor);
  if (existing) {
    await db.update(rpgSheets).set({ sheet: input.sheet, updatedAt: input.now }).where(eq(rpgSheets.id, existing.id));
    return { ...existing, sheet: input.sheet, updatedAt: input.now };
  }
  const rows = await db
    .insert(rpgSheets)
    .values({
      id: input.id,
      gameId: input.gameId,
      characterId: input.characterId,
      userId: input.userId,
      sheet: input.sheet,
      createdAt: input.now,
      updatedAt: input.now,
    })
    .returning();
  const row = rows[0];
  if (!row) {
    throw new Error("upsertSheet: no row returned");
  }
  return parseSheetRow(row);
}
