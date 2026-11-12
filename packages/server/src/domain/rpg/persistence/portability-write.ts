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
import { RPG_SNAPSHOT_KIND, rpgGameConfigSchema, rpgRecordedToolCallSchema, rpgSheetSchema, rpgSnapshotStateSchema } from "@orb/contracts/rpg";
import { rpgCheckpoints, rpgGames, rpgJournal, rpgSheets, rpgSnapshots, rpgTurnToolCalls } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchMany, isConstraintViolation } from "@orb/db/query";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { RpgGameId, RpgSnapshotId } from "@orb/kit/ids";
import { UnreadableJsonText } from "@orb/kit/json";
import { asc, eq, inArray } from "drizzle-orm";
import { RpgStateCorruptError } from "../contract/errors.ts";
import type { RpgPortabilityContext } from "../contract/portability.ts";
import { bookmarkArmKeys } from "./snapshots.ts";

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
      sheets: sheetRows.map((row): RpgPortableSheet => {
        // Tested before the schema, which defaults every field and would export the marker as an empty sheet.
        if (row.sheet instanceof UnreadableJsonText) {
          throw new RpgStateCorruptError("rpg_sheets", row.id, "sheet: the stored text is not JSON");
        }
        return { characterId: row.characterId, sheet: rpgSheetSchema.parse(row.sheet) };
      }),
      snapshots: snapshotRows.map(
        (row): RpgPortableSnapshot => ({
          messageId: row.messageId,
          variantId: row.variantId,
          asOfMessageId: row.asOfMessageId,
          bookmark: row.kind === RPG_SNAPSHOT_KIND.bookmark,
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

type SnapshotArm = Pick<typeof rpgSnapshots.$inferInsert, "messageId" | "variantId" | "asOfMessageId" | "kind"> &
  Pick<RpgPortableSnapshot, "committed" | "createdAt">;

/** A carried beat keeps its keys; its kind follows them, as the arm CHECK requires. */
function beatArm(snapshot: RpgPortableSnapshot): SnapshotArm {
  return {
    messageId: snapshot.messageId,
    variantId: snapshot.variantId,
    asOfMessageId: snapshot.asOfMessageId,
    kind: snapshot.variantId === null ? RPG_SNAPSHOT_KIND.hand : RPG_SNAPSHOT_KIND.turn,
    committed: snapshot.committed,
    createdAt: snapshot.createdAt,
  };
}

/** The positions of the checkpoint copies a v0.3.x file carries as plain hand snapshots. That release saved a
 *  checkpoint as a hand row created with the checkpoint's own time and pinned it, so a hand snapshot a checkpoint
 *  names with the same `createdAt` is saved state, not a beat. Migration 0006 applies the same rule in place. A
 *  hand edit a checkpoint reused was made before it, so it stays a beat. */
function v03SavedCopies(game: Pick<RpgPortableGame, "snapshots" | "checkpoints">): ReadonlySet<number> {
  return new Set(
    game.checkpoints
      .filter((checkpoint) => {
        const target = game.snapshots[checkpoint.snapshotIndex];
        return target !== undefined && !target.bookmark && target.variantId === null && target.createdAt === checkpoint.createdAt;
      })
      .map((checkpoint) => checkpoint.snapshotIndex),
  );
}

/** One snapshot INSERT from a portable snapshot's state under the given row identity and kind, so a bookmark
 *  copy shares the column mapping with the row it copies. */
function snapshotValues(source: RpgPortableSnapshot, id: RpgSnapshotId, gameId: RpgGameId, arm: SnapshotArm): typeof rpgSnapshots.$inferInsert {
  return {
    id,
    gameId,
    messageId: arm.messageId,
    variantId: arm.variantId,
    asOfMessageId: arm.asOfMessageId,
    kind: arm.kind,
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
    createdAt: arm.createdAt,
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
    const savedCopies = v03SavedCopies(game);
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
      // A carried bookmark is not inserted as itself: it is state a checkpoint saved, and each checkpoint below
      // writes its own bookmark copy. Inserting it would need the row's kind to survive, and a file written
      // before bookmarks existed cannot say which rows were saved state, so `savedCopies` recognises those.
      ...game.snapshots.flatMap((snapshot, i) =>
        snapshot.bookmark || savedCopies.has(i)
          ? []
          : [ctx.db.insert(rpgSnapshots).values(snapshotValues(snapshot, snapshotIds[i] ?? ctx.ids.snapshot(), gameId, beatArm(snapshot)))],
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
        // Pruned by the serde already; kept because RESTRICT makes the db failure abort the WHOLE batch,
        // taking the restored campaign with it.
        if (target === undefined) {
          return [];
        }
        // The bookmark rule (`persistence/snapshots.ts`): every checkpoint pins its own bookmark copy of the
        // state it names, turn, hand or bookmark, created at the checkpoint's time. The foreign key refuses
        // anything else, and the copy stays off the state ladder.
        const pinned = ctx.ids.snapshot();
        return [
          ctx.db
            .insert(rpgSnapshots)
            .values(snapshotValues(target, pinned, gameId, { ...bookmarkArmKeys(), committed: true, createdAt: checkpoint.createdAt })),
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
