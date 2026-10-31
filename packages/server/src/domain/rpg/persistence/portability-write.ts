// domain/rpg/persistence/portability-write — the two portability factories (contract/portability.ts). The
// campaign's READ-WHOLE and WRITE-WHOLE, the explicit named exception to "persistence is queries only" (the
// databank/regex portability-write precedent, and chat's own `import-write.ts` one plane over).
//
// SCOPE GATE: neither op scopes on an owner, and that is correct rather than a hole — rpg stamps no owner
// ANYWHERE (D23), authority derives through `rpg_games.chatId → chat_participants`, and BOTH callers run
// that gate on the CHAT before they get here (the export verb's host gate; the import verb's freshly-minted
// chat, which the importer owns by construction). Ends if either op ever gains a caller that has not
// already resolved chat authority.
//
// BOTH halves use ONE `db.batch`. The export's batch is SELECT-only, so libSQL's deferred transaction fixes
// one database snapshot and never hits the forbidden read→write upgrade; the import's batch is pure-write.
// `db.transaction()` remains BANNED (the :memory: connection-replacement trap). A concurrent campaign write
// therefore cannot make export pair checkpoint rows with a different snapshot set, and a kill mid-import
// leaves the chat with no game rather than half a campaign.

import type {
  ExportRpgGame,
  ImportRpgGame,
  RpgImportOutcome,
  RpgPortableCheckpoint,
  RpgPortableGame,
  RpgPortableJournalEntry,
  RpgPortableSheet,
  RpgPortableSnapshot,
  RpgPortableTurnToolCalls,
} from "@orb/contracts/rpg";
import { rpgGameConfigSchema, rpgRecordedToolCallSchema, rpgSheetSchema, rpgSnapshotStateSchema } from "@orb/contracts/rpg";
import { rpgCheckpoints, rpgGames, rpgJournal, rpgSheets, rpgSnapshots, rpgTurnToolCalls } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchMany, isConstraintViolation } from "@orb/db/query";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { RpgGameId, RpgSnapshotId } from "@orb/kit/ids";
import { asc, eq, inArray } from "drizzle-orm";
import type { RpgPortabilityContext } from "../contract/portability.ts";

const LIMIT_ONE = 1;

/** Validate the snapshot columns against their canonical composed state before exporting them. */
function composeState(row: typeof rpgSnapshots.$inferSelect): RpgPortableSnapshot["state"] {
  return rpgSnapshotStateSchema.parse({
    clock: row.clock,
    calendarDate: row.calendarDate,
    location: row.location,
    weather: row.weather,
    presentCharacters: row.presentCharacters ?? undefined,
    recentEvents: row.recentEvents ?? undefined,
    actorState: row.actorState ?? undefined,
    trackerValues: row.trackerValues ?? undefined,
    quests: row.quests ?? undefined,
    plot: row.plot,
    fieldLocks: row.fieldLocks,
  });
}

export function createExportRpgGame(input: DbAssemblyInput<Pick<RpgPortabilityContext, "db">>): ExportRpgGame {
  const ctx = { db: databaseForOwner(input.db) };
  return async ({ chatId }): Promise<RpgPortableGame | null> => {
    // Every statement must be prepared before the batch runs, so child rows resolve the game's id through the
    // same chat-scoped subquery. Six ordered SELECTs then ride ONE deferred, read-only transaction: the first
    // SELECT fixes the SQLite snapshot and no statement upgrades it to a writer.
    const gameIdForChat = ctx.db.select({ id: rpgGames.id }).from(rpgGames).where(eq(rpgGames.chatId, chatId));
    const [gameRows, sheetRows, snapshotRows, journalRows, toolCallRows, checkpointRows] = await ctx.db.batch([
      ctx.db.select().from(rpgGames).where(eq(rpgGames.chatId, chatId)).limit(LIMIT_ONE),
      ctx.db.select().from(rpgSheets).where(inArray(rpgSheets.gameId, gameIdForChat)).orderBy(asc(rpgSheets.createdAt), asc(rpgSheets.id)),
      ctx.db.select().from(rpgSnapshots).where(inArray(rpgSnapshots.gameId, gameIdForChat)).orderBy(asc(rpgSnapshots.createdAt), asc(rpgSnapshots.id)),
      ctx.db.select().from(rpgJournal).where(inArray(rpgJournal.gameId, gameIdForChat)).orderBy(asc(rpgJournal.createdAt), asc(rpgJournal.id)),
      ctx.db
        .select()
        .from(rpgTurnToolCalls)
        .where(inArray(rpgTurnToolCalls.gameId, gameIdForChat))
        .orderBy(asc(rpgTurnToolCalls.createdAt), asc(rpgTurnToolCalls.id)),
      ctx.db.select().from(rpgCheckpoints).where(inArray(rpgCheckpoints.gameId, gameIdForChat)).orderBy(asc(rpgCheckpoints.createdAt), asc(rpgCheckpoints.id)),
    ]);
    const game = gameRows[0];
    if (game === undefined) {
      return null;
    }
    // The checkpoint's target rides as a POSITION in the snapshot array this same read just ordered — the
    // only way a checkpoint can name its snapshot when neither row's id survives the trip.
    // query-local index over the row set this query just returned. Ends if it outlives the call.
    const snapshotPosition = new Map<RpgSnapshotId, number>(snapshotRows.map((row, i) => [row.id, i]));
    return {
      mode: game.mode,
      status: game.status,
      sessionNumber: game.sessionNumber,
      config: rpgGameConfigSchema.parse(game.config),
      createdAt: game.createdAt,
      sheets: sheetRows.map((row): RpgPortableSheet => ({ characterId: row.characterId, sheet: rpgSheetSchema.parse(row.sheet) })),
      snapshots: snapshotRows.map(
        (row): RpgPortableSnapshot => ({
          messageId: row.messageId,
          variantId: row.variantId,
          asOfMessageId: row.asOfMessageId,
          committed: row.committed !== 0,
          createdAt: row.createdAt,
          state: composeState(row),
        }),
      ),
      journal: journalRows.map(
        (row): RpgPortableJournalEntry => ({
          type: row.type,
          label: row.label,
          title: row.title,
          content: row.content,
          variantId: row.variantId,
          sourceMessageId: row.sourceMessageId,
          createdAt: row.createdAt,
        }),
      ),
      turnToolCalls: toolCallRows.map(
        (row): RpgPortableTurnToolCalls => ({
          messageId: row.messageId,
          variantId: row.variantId,
          calls: rpgRecordedToolCallSchema.array().parse(row.calls),
          createdAt: row.createdAt,
        }),
      ),
      checkpoints: checkpointRows.flatMap((row): RpgPortableCheckpoint[] => {
        const snapshotIndex = snapshotPosition.get(row.snapshotId);
        // Unreachable through the db's RESTRICT FK; skipped rather than emitting `-1`, so a hand-repaired
        // database cannot write a bundle whose checkpoint points at nothing.
        return snapshotIndex === undefined ? [] : [{ snapshotIndex, label: row.label, trigger: row.trigger, createdAt: row.createdAt }];
      }),
    };
  };
}

type SnapshotArm = Pick<RpgPortableSnapshot, "messageId" | "variantId" | "asOfMessageId" | "committed">;

/** One snapshot INSERT from a portable snapshot's state under the given row identity, so a hand clone of a turn
 *  row shares the column mapping with the row it copies. */
function snapshotValues(source: RpgPortableSnapshot, id: RpgSnapshotId, gameId: RpgGameId, arm: SnapshotArm): typeof rpgSnapshots.$inferInsert {
  return {
    id,
    gameId,
    messageId: arm.messageId,
    variantId: arm.variantId,
    asOfMessageId: arm.asOfMessageId,
    clock: source.state.clock,
    calendarDate: source.state.calendarDate,
    location: source.state.location,
    weather: source.state.weather,
    presentCharacters: source.state.presentCharacters,
    recentEvents: source.state.recentEvents,
    actorState: source.state.actorState,
    trackerValues: source.state.trackerValues,
    quests: source.state.quests,
    plot: source.state.plot,
    fieldLocks: source.state.fieldLocks,
    committed: arm.committed ? 1 : 0,
    createdAt: source.createdAt,
  };
}

export function createImportRpgGame(input: DbAssemblyInput<RpgPortabilityContext>): ImportRpgGame {
  const ctx: RpgPortabilityContext = { ...input, db: databaseForOwner(input.db) };
  return async ({ chatId, hostUserId, game }): Promise<RpgImportOutcome> => {
    const existing = await ctx.db.select({ id: rpgGames.id }).from(rpgGames).where(eq(rpgGames.chatId, chatId)).limit(LIMIT_ONE);
    if (existing[0] !== undefined) {
      return "kept-existing";
    }
    if (game === null) {
      return "not-restored";
    }
    const gameId = ctx.ids.game();
    const at = ctx.now();
    // Snapshot ids are minted UP FRONT so the checkpoint rows can name them by the position the payload
    // carries — the inverse of the export's `snapshotPosition` index, and the reason both live in this file.
    const snapshotIds = game.snapshots.map(() => ctx.ids.snapshot());
    const stmts: BatchStmt[] = [
      ctx.db.insert(rpgGames).values({
        id: gameId,
        chatId,
        mode: game.mode,
        status: game.status,
        sessionNumber: game.sessionNumber,
        config: game.config,
        createdAt: game.createdAt,
        updatedAt: at,
      }),
      ...game.sheets.map((sheet) =>
        ctx.db.insert(rpgSheets).values({
          id: ctx.ids.sheet(),
          gameId,
          // The actor XOR: a carried character sheet keeps its (already-remapped) card; the host sheet
          // re-keys onto the importer, who is the room's only human.
          characterId: sheet.characterId,
          userId: sheet.characterId === null ? hostUserId : null,
          sheet: sheet.sheet,
          createdAt: at,
          updatedAt: at,
        }),
      ),
      ...game.snapshots.map((snapshot, i) =>
        ctx.db.insert(rpgSnapshots).values(snapshotValues(snapshot, snapshotIds[i] ?? ctx.ids.snapshot(), gameId, snapshot)),
      ),
      ...game.journal.map((entry) =>
        ctx.db.insert(rpgJournal).values({
          id: ctx.ids.journal(),
          gameId,
          type: entry.type,
          label: entry.label,
          title: entry.title,
          content: entry.content,
          variantId: entry.variantId,
          sourceMessageId: entry.sourceMessageId,
          createdAt: entry.createdAt,
        }),
      ),
      ...game.turnToolCalls.map((record) =>
        ctx.db.insert(rpgTurnToolCalls).values({
          id: ctx.ids.turnToolCalls(),
          gameId,
          messageId: record.messageId,
          variantId: record.variantId,
          calls: record.calls,
          createdAt: record.createdAt,
        }),
      ),
      ...game.checkpoints.flatMap((checkpoint) => {
        const target = game.snapshots[checkpoint.snapshotIndex];
        const snapshotId = snapshotIds[checkpoint.snapshotIndex];
        // Pruned by the serde already; belt kept because RESTRICT makes the db failure abort the WHOLE batch,
        // taking the restored campaign with it.
        if (target === undefined || snapshotId === undefined) {
          return [];
        }
        // A bookmark pins an immutable hand row, never a turn row: deleting the turn's message cascades its
        // snapshot, and the checkpoint's RESTRICT refuses that delete. A file whose checkpoint names a turn
        // row gets a hand clone to pin instead, stamped at the turn the way a live checkpoint detaches.
        const pinned = target.variantId === null ? snapshotId : ctx.ids.snapshot();
        const detached =
          target.variantId === null
            ? []
            : [
                ctx.db
                  .insert(rpgSnapshots)
                  .values(snapshotValues(target, pinned, gameId, { messageId: null, variantId: null, asOfMessageId: target.messageId, committed: true })),
              ];
        return [
          ...detached,
          ctx.db.insert(rpgCheckpoints).values({
            id: ctx.ids.checkpoint(),
            gameId,
            snapshotId: pinned,
            label: checkpoint.label,
            trigger: checkpoint.trigger,
            createdAt: checkpoint.createdAt,
          }),
        ];
      }),
    ];
    try {
      await ctx.db.batch(batchMany(stmts));
    } catch (err) {
      const kind = isConstraintViolation(err)?.kind;
      if (kind !== "unique" && kind !== "primary-key") {
        throw err;
      }
      // A concurrent replay can lose only the one-game-per-chat arbiter. Re-read before classifying so a
      // constraint failure in any child table remains loud.
      const winner = await ctx.db.select({ id: rpgGames.id }).from(rpgGames).where(eq(rpgGames.chatId, chatId)).limit(LIMIT_ONE);
      if (winner[0] === undefined) {
        throw err;
      }
      return "kept-existing";
    }
    return "restored";
  };
}
