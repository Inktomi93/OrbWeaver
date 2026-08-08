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
// The write commits as ONE `db.batch` — `db.transaction()` is BANNED (the :memory: trap), the same rule
// chat's import-write follows. A kill mid-restore therefore leaves the chat with no game rather than half a
// campaign, which is the honest partial: a gameless chat is a legal state, a game missing its snapshots is
// not.

import { rpgCheckpoints, rpgGames, rpgJournal, rpgSheets, rpgSnapshots, rpgTurnToolCalls } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { RpgSnapshotId } from "@orb/kit/ids";
import { asc, eq } from "drizzle-orm";
import type {
  ExportRpgGame,
  ImportRpgGame,
  RpgPortabilityContext,
  RpgPortableCheckpoint,
  RpgPortableGame,
  RpgPortableJournalEntry,
  RpgPortableSheet,
  RpgPortableSnapshot,
  RpgPortableTurnToolCalls,
} from "../contract/portability.ts";

const LIMIT_ONE = 1;

/** The composed snapshot STATE from one `rpg_snapshots` row's JSON columns. The db splits the state across
 *  columns; the contract's `rpgSnapshotStateSchema` is the composed shape, and `$type` already gives each
 *  column its parsed type — so this is a re-composition, not a re-parse. `?? default` mirrors the schema's
 *  own `.default()`s for the born-nullable planes. */
function composeState(row: typeof rpgSnapshots.$inferSelect): RpgPortableSnapshot["state"] {
  return {
    clock: row.clock ?? null,
    calendarDate: row.calendarDate,
    location: row.location,
    weather: row.weather ?? null,
    // Spread, not pass-through: the columns are `$type<readonly …[]>` and the composed contract shape is
    // zod-inferred (mutable). One copy at the read boundary, never a cast.
    presentCharacters: [...(row.presentCharacters ?? [])],
    recentEvents: [...(row.recentEvents ?? [])],
    actorState: [...(row.actorState ?? [])],
    trackerValues: row.trackerValues ?? {},
    quests: [...(row.quests ?? [])],
    plot: row.plot ?? null,
    fieldLocks: row.fieldLocks ?? null,
  };
}

export function createExportRpgGame(ctx: Pick<RpgPortabilityContext, "db">): ExportRpgGame {
  return async ({ chatId }): Promise<RpgPortableGame | null> => {
    const [game] = await ctx.db.select().from(rpgGames).where(eq(rpgGames.chatId, chatId)).limit(LIMIT_ONE);
    if (game === undefined) {
      return null;
    }
    const [sheetRows, snapshotRows, journalRows, toolCallRows, checkpointRows] = await Promise.all([
      ctx.db.select().from(rpgSheets).where(eq(rpgSheets.gameId, game.id)).orderBy(asc(rpgSheets.createdAt), asc(rpgSheets.id)),
      ctx.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, game.id)).orderBy(asc(rpgSnapshots.createdAt), asc(rpgSnapshots.id)),
      ctx.db.select().from(rpgJournal).where(eq(rpgJournal.gameId, game.id)).orderBy(asc(rpgJournal.createdAt), asc(rpgJournal.id)),
      ctx.db.select().from(rpgTurnToolCalls).where(eq(rpgTurnToolCalls.gameId, game.id)).orderBy(asc(rpgTurnToolCalls.createdAt), asc(rpgTurnToolCalls.id)),
      ctx.db.select().from(rpgCheckpoints).where(eq(rpgCheckpoints.gameId, game.id)).orderBy(asc(rpgCheckpoints.createdAt), asc(rpgCheckpoints.id)),
    ]);
    // The checkpoint's target rides as a POSITION in the snapshot array this same read just ordered — the
    // only way a checkpoint can name its snapshot when neither row's id survives the trip.
    // @orb-gate-ignore persistence-no-in-memory-state: query-local index over the row set this query just returned
    const snapshotPosition = new Map<RpgSnapshotId, number>(snapshotRows.map((row, i) => [row.id, i]));
    return {
      mode: game.mode,
      status: game.status,
      sessionNumber: game.sessionNumber,
      config: game.config,
      createdAt: game.createdAt,
      sheets: sheetRows.map((row): RpgPortableSheet => ({ characterId: row.characterId, sheet: row.sheet })),
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
          calls: row.calls,
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

export function createImportRpgGame(ctx: RpgPortabilityContext): ImportRpgGame {
  return async ({ chatId, hostUserId, game }): Promise<void> => {
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
        ctx.db.insert(rpgSnapshots).values({
          id: snapshotIds[i] ?? ctx.ids.snapshot(),
          gameId,
          messageId: snapshot.messageId,
          variantId: snapshot.variantId,
          asOfMessageId: snapshot.asOfMessageId,
          clock: snapshot.state.clock,
          calendarDate: snapshot.state.calendarDate,
          location: snapshot.state.location,
          weather: snapshot.state.weather,
          presentCharacters: snapshot.state.presentCharacters,
          recentEvents: snapshot.state.recentEvents,
          actorState: snapshot.state.actorState,
          trackerValues: snapshot.state.trackerValues,
          quests: snapshot.state.quests,
          plot: snapshot.state.plot,
          fieldLocks: snapshot.state.fieldLocks,
          committed: snapshot.committed ? 1 : 0,
          createdAt: snapshot.createdAt,
        }),
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
        const snapshotId = snapshotIds[checkpoint.snapshotIndex];
        // Pruned by the serde already; belt kept because RESTRICT makes the db failure abort the WHOLE batch,
        // taking the restored campaign with it.
        return snapshotId === undefined
          ? []
          : [
              ctx.db.insert(rpgCheckpoints).values({
                id: ctx.ids.checkpoint(),
                gameId,
                snapshotId,
                label: checkpoint.label,
                trigger: checkpoint.trigger,
                createdAt: checkpoint.createdAt,
              }),
            ];
      }),
    ];
    await ctx.db.batch(batchMany(stmts));
  };
}
