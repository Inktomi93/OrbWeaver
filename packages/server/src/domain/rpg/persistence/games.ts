// domain/rpg/persistence/games — the `rpg_games` row lifecycle (rpg-design/05 §2.1). QUERIES ONLY. The game
// row is the TRUTH — game-ness resolves server-side by this row, always (the opaque `chats.metadata.rpg`
// pointer is a sync SIGNAL only, written by the verb layer, W1b). `config` is parse-on-read through the
// contract schema (a corrupt blob is a loud typed error, never a silent default — the ONE exception is the
// retired-delivery-mode heal below, scoped to that single field). No `ownerId` (D23) —
// authority derives through `chatId → chat_participants`, gated at the producer verb (W1b), never here.

import { RPG_EXTRACTION_MODES, rpgGameConfigSchema } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { rpgGames } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchStmt } from "@orb/db/kit";
import type { ChatId, PresetId, RpgGameId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { RpgStateCorruptError } from "../contract/errors.ts";
import type { NewRpgGame, RpgGameRow } from "../contract/service.ts";

const LIMIT_ONE = 1;

/** PRE-LAUNCH HEAL, scoped to ONE field (a delivery mode was DELETED whole, NO-LEGACY).
 *  A game blob written while the retired mode existed would fail the enum and hard-throw the whole game on read —
 *  a dead knob taking down a live room. So an UNRECOGNIZED `extractionMode` is dropped to `undefined`, which the
 *  schema `.default` then fills with the born default. Nothing else is softened: every other corrupt field still
 *  throws loud (`RpgStateCorruptError`), and the WRITE door still rejects an unknown mode (`updateConfig`). */
function healRetiredExtractionMode(config: unknown): unknown {
  if (typeof config !== "object" || config === null || !("extractionMode" in config)) {
    return config;
  }
  const mode: unknown = (config as { extractionMode: unknown }).extractionMode;
  return (RPG_EXTRACTION_MODES as readonly unknown[]).includes(mode) ? config : { ...config, extractionMode: undefined };
}

/** Re-validate the `config` JSON blob through its contract schema (parse-on-read). */
function parseGameRow(row: RpgGameRow): RpgGameRow {
  const parsed = rpgGameConfigSchema.safeParse(healRetiredExtractionMode(row.config));
  if (!parsed.success) {
    throw new RpgStateCorruptError("rpg_games", row.id, `config: ${parsed.error.message}`);
  }
  return { ...row, config: parsed.data };
}

/** Insert the game row, returning it parsed. Production birth uses the statement-plan seam in
 *  `game-mint.ts`; this eager twin is the setup door the rpg suites mint a game through.
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export async function insertGame(db: Db, values: NewRpgGame): Promise<RpgGameRow> {
  const rows = await db.insert(rpgGames).values(values).returning();
  const row = rows[0];
  if (!row) {
    throw new Error("insertGame: no row returned");
  }
  return parseGameRow(row);
}

/** The game keyed by its id, parsed, or `undefined`.
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export async function findGameById(db: Db, id: RpgGameId): Promise<RpgGameRow | undefined> {
  const rows = await db.select().from(rpgGames).where(eq(rpgGames.id, id)).limit(LIMIT_ONE);
  return rows[0] ? parseGameRow(rows[0]) : undefined;
}

/** The game for a chat (one per chat — the UNIQUE chatId), parsed, or `undefined`. Game-ness resolves here. */
export async function findGameByChat(db: Db, chatId: ChatId): Promise<RpgGameRow | undefined> {
  const rows = await db.select().from(rpgGames).where(eq(rpgGames.chatId, chatId)).limit(LIMIT_ONE);
  return rows[0] ? parseGameRow(rows[0]) : undefined;
}

/** The `gmPresetId` clear, UNEXECUTED — the host-handoff heal hands it to chat so the knob clear commits in
 *  the SAME atomic batch as the role swap (the {@link AwaitableBatchStmt} co-statement seam chat's own
 *  `markUserLeftStatement`/`setPendingHostStatement` ride). A separate write would leave a window where the
 *  new host owns a room whose GM voice still points at the old host's private preset. */
export function clearGmPresetStatement(db: Db, id: RpgGameId, now: number): BatchStmt {
  return batchStmt(db.update(rpgGames).set({ gmPresetId: null, updatedAt: now }).where(eq(rpgGames.id, id)));
}

/** The `gmPresetId` RE-POINT, UNEXECUTED — {@link clearGmPresetStatement}'s opposite arm. Written only by the
 *  host-handoff copy, which has already minted `presetId` into the incoming host's own library: the room keeps
 *  the GM voice it had instead of degrading to the new host's default, and the knob points at a row they can
 *  actually inspect. Rides the SAME batch as the role swap for the same reason the clear does. */
export function setGmPresetStatement(db: Db, id: RpgGameId, presetId: PresetId, now: number): BatchStmt {
  return batchStmt(db.update(rpgGames).set({ gmPresetId: presetId, updatedAt: now }).where(eq(rpgGames.id, id)));
}

/** Patch the game's mutable columns (the config write door + the `gmPresetId` knob — the verb gates, W1b).
 *  `updatedAt` is caller-supplied (injected clock, no ambient `Date.now`). */
export async function updateGame(
  db: Db,
  id: RpgGameId,
  patch: Partial<Pick<NewRpgGame, "config" | "gmPresetId" | "status" | "gmUserId" | "sessionNumber" | "updatedAt">>,
): Promise<void> {
  await db.update(rpgGames).set(patch).where(eq(rpgGames.id, id));
}
