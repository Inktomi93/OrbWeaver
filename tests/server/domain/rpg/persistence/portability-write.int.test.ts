// persistence/portability-write (R6) — the campaign's read-whole / write-whole pair, the rpg half of the
// orb-native chat bundle. .int: real FK (the two-arm snapshot CHECK, the sheet actor XOR, the checkpoint's
// RESTRICT are all db-enforced, and this file's whole job is producing/consuming rows that satisfy them).
//
// The load-bearing pin is the CHECKPOINT↔SNAPSHOT positional handshake: neither row's id survives a
// cross-box move, so the export writes the checkpoint's target as an INDEX into the snapshot array it just
// ordered, and the import mints snapshot ids up front so that index resolves back. Export and import own
// opposite halves of one convention — this is where they are proven to agree.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pid } from "node:process";
import type { Db, LibSqlWrap } from "@orb/db";
import { createDb, rpgCheckpoints, rpgGames, rpgJournal, rpgSheets, rpgSnapshots, rpgTurnToolCalls, runMigrations } from "@orb/db";
import type { ChatId, Handle, MessageId, MessageVariantId, RpgCheckpointId, RpgGameId, RpgSheetId, RpgTurnToolCallsId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RpgPortabilityContext } from "@orb/server/domain/rpg";
import { createExportRpgGame, createImportRpgGame } from "@orb/server/domain/rpg";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { FROZEN_AT, seedChat, seedMessage, seedUser } from "../../chat/_support.ts";
import { seedGame, snapshotId } from "../_support.ts";

let db: Db;
const MIGRATIONS_DIR = "packages/db/src/migrations";
beforeEach(async () => {
  db = await freshDb();
});

function sqlOf(arg: unknown): string {
  if (typeof arg === "string") {
    return arg;
  }
  return arg !== null && typeof arg === "object" && "sql" in arg ? String((arg as { readonly sql?: string }).sql ?? "") : "";
}

async function runInterleavedBatch(
  execute: (statement: unknown) => Promise<unknown>,
  statements: readonly unknown[],
  mutate: () => Promise<void>,
): Promise<unknown[]> {
  await execute("BEGIN DEFERRED");
  const results: unknown[] = [];
  try {
    for (const statement of statements) {
      results.push(await execute(statement));
      if (sqlOf(statement).includes('from "rpg_snapshots"')) {
        await mutate();
      }
    }
    await execute("COMMIT");
    return results;
  } catch (err) {
    await execute("ROLLBACK");
    throw err;
  }
}

/** A real-client interposer that schedules one writer after the exporter has read `rpg_snapshots` but before
 * it reads `rpg_checkpoints`. The old independent-query path observes the two different states. The batch arm
 * executes the supplied statements inside an explicit deferred transaction only to expose that same seam to
 * the writer; SQLite's real snapshot isolation decides what each later SELECT sees. */
function interleaveAfterSnapshots(mutate: () => Promise<void>): LibSqlWrap {
  return (client) => {
    let mutation: Promise<void> | undefined;
    const once = (): Promise<void> => {
      mutation ??= mutate();
      return mutation;
    };
    const snapshotRead = Promise.withResolvers<void>();
    return new Proxy(client, {
      get(target, prop): unknown {
        const value = Reflect.get(target, prop, target);
        if (typeof value !== "function" || typeof prop !== "string") {
          return value;
        }
        if (prop === "execute") {
          return async (...args: unknown[]): Promise<unknown> => {
            const sql = sqlOf(args[0]);
            if (sql.includes('from "rpg_checkpoints"')) {
              await snapshotRead.promise;
              await once();
            }
            const result = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
            if (sql.includes('from "rpg_snapshots"')) {
              snapshotRead.resolve();
            }
            return result;
          };
        }
        if (prop === "batch") {
          // @orb-waive no-test-fabrication(unknown): this proxy deliberately narrows libSQL's overloaded execute method to the Ends when this deliberate test boundary can be expressed without a fabricated typed value.
          // single statement shape exercised by the interleaved batch fault injector.
          const execute = (statement: unknown): Promise<unknown> => (target.execute as unknown as (stmt: unknown) => Promise<unknown>).call(target, statement);
          return (statements: readonly unknown[]): Promise<unknown[]> => runInterleavedBatch(execute, statements, once);
        }
        return value.bind(target);
      },
    });
  };
}

/** The DI bundle both factories close over — COUNTER-minted ids so an assertion can name what was written. */
function portabilityCtx(database: Db): RpgPortabilityContext {
  let seq = 0;
  const next = (prefix: string): string => {
    seq += 1;
    return `${prefix}_w${seq}`;
  };
  return {
    db: database,
    now: (): number => FROZEN_AT,
    ids: {
      game: () => castId(next("rpg_game")),
      snapshot: () => castId(next("rpg_snapshot")),
      sheet: () => castId(next("rpg_sheet")),
      journal: () => castId(next("rpg_journal")),
      checkpoint: () => castId(next("rpg_checkpoint")),
      turnToolCalls: () => castId(next("rpg_turn_tool_calls")),
      quest: () => castId(next("q")),
      item: () => next("item"),
    },
  };
}

/** A source chat carrying one assistant turn + a whole campaign anchored to that turn's variant. */
async function seedSourceCampaign(database: Db): Promise<{ chatId: ChatId; gameId: RpgGameId; variantId: MessageVariantId; messageId: MessageId }> {
  const chatId = await seedChat(database, "src");
  const gameId = await seedGame(database, chatId);
  const { messageId, variantId } = await seedMessage(database, chatId, 1, { role: "assistant", content: "The bridge fell." });
  const snapId = snapshotId("s1");
  await database.insert(rpgSnapshots).values({
    id: snapId,
    gameId,
    messageId,
    variantId,
    location: "the broken bridge",
    committed: 1,
    createdAt: FROZEN_AT,
  });
  await database.insert(rpgJournal).values({
    id: castId("rpg_journal_src"),
    gameId,
    type: "event",
    label: "",
    title: "The bridge fell",
    content: "The span gave way.",
    variantId,
    sourceMessageId: messageId,
    createdAt: FROZEN_AT,
  });
  await database.insert(rpgTurnToolCalls).values({
    id: castId<RpgTurnToolCallsId>("rpg_turn_tool_calls_src"),
    gameId,
    messageId,
    variantId,
    calls: [{ name: "update_scene", args: '{"location":"the broken bridge"}', verdict: "applied", issues: [] }],
    createdAt: FROZEN_AT,
  });
  await database.insert(rpgCheckpoints).values({
    id: castId<RpgCheckpointId>("rpg_checkpoint_src"),
    gameId,
    snapshotId: snapId,
    label: "before the bridge",
    trigger: "manual",
    createdAt: FROZEN_AT,
  });
  return { chatId, gameId, variantId, messageId };
}

describe("createExportRpgGame", () => {
  test("reads the whole campaign; a chat with no game answers null (the common case is not an error)", async () => {
    const gameless = await seedChat(db, "gameless");
    const exportGame = createExportRpgGame({ db });
    expect(await exportGame({ chatId: gameless })).toBeNull();

    const { chatId } = await seedSourceCampaign(db);
    const game = await exportGame({ chatId });
    expect(game).not.toBeNull();
    expect(game?.snapshots).toHaveLength(1);
    expect(game?.journal).toHaveLength(1);
    expect(game?.turnToolCalls).toHaveLength(1);
    expect(game?.checkpoints).toHaveLength(1);
  });

  test("a checkpoint names its snapshot by POSITION in the exported array — the only ref that survives an id-less move", async () => {
    const { chatId } = await seedSourceCampaign(db);
    const game = await createExportRpgGame({ db })({ chatId });
    expect(game?.checkpoints[0]?.snapshotIndex).toBe(0);
    expect(game?.checkpoints[0]?.label).toBe("before the bridge");
  });

  test("one concurrent database snapshot cannot mix a checkpoint with the wrong snapshot set", async () => {
    const dir = mkdtempSync(join(tmpdir(), `orb-rpg-export-snapshot-${pid}-`));
    const path = join(dir, "export.db");
    try {
      const writer = await createDb(`file:${path}`);
      await runMigrations(writer, MIGRATIONS_DIR);
      const { chatId, gameId } = await seedSourceCampaign(writer);
      const nextSnapshotId = snapshotId("concurrent");
      let mutationApplied = false;
      const reader = await createDb(
        `file:${path}`,
        interleaveAfterSnapshots(async () => {
          await writer.insert(rpgSnapshots).values({
            id: nextSnapshotId,
            gameId,
            messageId: null,
            variantId: null,
            asOfMessageId: null,
            location: "after the concurrent write",
            committed: 1,
            createdAt: FROZEN_AT + 1,
          });
          await writer.update(rpgCheckpoints).set({ snapshotId: nextSnapshotId }).where(eq(rpgCheckpoints.gameId, gameId));
          mutationApplied = true;
        }),
      );

      const exported = await createExportRpgGame({ db: reader })({ chatId });
      expect(mutationApplied).toBe(true); // planted control: this green cannot come from a writer that never ran
      expect(exported).not.toBeNull();
      // Both the pre-write and post-write database states carry one checkpoint. Zero is possible only when the
      // export mixed the old snapshot set with the new checkpoint target and silently dropped the mismatch.
      expect(exported?.checkpoints).toHaveLength(1);
      const target = exported?.checkpoints[0];
      expect(target).toBeDefined();
      expect(exported?.snapshots[target?.snapshotIndex ?? -1]).toBeDefined();
    } finally {
      for (const suffix of ["", "-wal", "-shm"]) {
        rmSync(`${path}${suffix}`, { force: true });
      }
      rmSync(dir, { force: true, recursive: true });
    }
  });

  test("gmUserId / gmPresetId do NOT ride — a cross-box seat and a preset id are dangling refs, not state", async () => {
    const { chatId, gameId } = await seedSourceCampaign(db);
    const gmUser = await seedUser(db, castId<Handle>("gm"));
    await db.update(rpgGames).set({ gmUserId: gmUser }).where(eq(rpgGames.id, gameId));

    const game = await createExportRpgGame({ db })({ chatId });
    // The payload has no slot for either — the shape itself is the enforcement, so assert on what it DOES
    // carry and let tsc keep the absence honest.
    expect(Object.keys(game ?? {})).not.toContain("gmUserId");
    expect(Object.keys(game ?? {})).not.toContain("gmPresetId");
  });
});

describe("createImportRpgGame", () => {
  test("writes the whole campaign onto a fresh chat, with every ref pointing at the ids it was HANDED", async () => {
    const { chatId: sourceChat } = await seedSourceCampaign(db);
    const exported = await createExportRpgGame({ db })({ chatId: sourceChat });
    if (exported === null) {
      throw new Error("the source campaign did not export");
    }

    // A DIFFERENT chat with its OWN turn — the caller (the bundle verb) remaps the refs; this op writes them.
    const targetChat = await seedChat(db, "dst");
    const target = await seedMessage(db, targetChat, 1, { role: "assistant", content: "The bridge fell." });
    const hostUserId = await seedUser(db, castId<Handle>("host"));
    const remapped = {
      ...exported,
      snapshots: exported.snapshots.map((s) => ({ ...s, messageId: target.messageId, variantId: target.variantId })),
      journal: exported.journal.map((e) => ({ ...e, variantId: target.variantId, sourceMessageId: target.messageId })),
      turnToolCalls: exported.turnToolCalls.map((t) => ({ ...t, messageId: target.messageId, variantId: target.variantId })),
    };

    await createImportRpgGame(portabilityCtx(db))({ chatId: targetChat, hostUserId, game: remapped });
    // Retry after the campaign batch committed but before the bundle caller observed completion.
    await createImportRpgGame(portabilityCtx(db))({ chatId: targetChat, hostUserId, game: remapped });

    const games = await db.select().from(rpgGames).where(eq(rpgGames.chatId, targetChat));
    expect(games).toHaveLength(1);
    const gameId = games[0]?.id ?? castId<RpgGameId>("none");
    const snaps = await db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, gameId));
    expect(snaps).toHaveLength(1);
    expect(snaps[0]?.variantId).toBe(target.variantId);
    expect(snaps[0]?.location).toBe("the broken bridge");
    const entries = await db.select().from(rpgJournal).where(eq(rpgJournal.gameId, gameId));
    expect(entries[0]?.variantId).toBe(target.variantId);
    expect(entries).toHaveLength(1);
    const records = await db.select().from(rpgTurnToolCalls).where(eq(rpgTurnToolCalls.gameId, gameId));
    expect(records[0]?.variantId).toBe(target.variantId);
    expect(records).toHaveLength(1);
    // THE HANDSHAKE: the carried `snapshotIndex` resolved back to the snapshot this same write minted.
    const checkpoints = await db.select().from(rpgCheckpoints).where(eq(rpgCheckpoints.gameId, gameId));
    expect(checkpoints[0]?.snapshotId).toBe(snaps[0]?.id);
  });

  test("a HOST sheet (no characterId) re-keys onto the importer — the actor XOR's user arm", async () => {
    const { chatId: sourceChat, gameId } = await seedSourceCampaign(db);
    const sheetUser = await seedUser(db, castId<Handle>("sheetuser"));
    await db.insert(rpgSheets).values([
      {
        id: castId<RpgSheetId>("rpg_sheet_src"),
        gameId,
        characterId: null,
        userId: sheetUser,
        sheet: { className: "Wanderer", attributes: {}, flavor: "", level: 4, trackerGrants: [], trackerRevokes: [] },
        createdAt: FROZEN_AT,
        updatedAt: FROZEN_AT,
      },
    ]);
    const exported = await createExportRpgGame({ db })({ chatId: sourceChat });
    if (exported === null) {
      throw new Error("the source campaign did not export");
    }
    // The export carries the sheet's characterId (null here — the host arm); the bundle verb resolves handles.
    expect(exported.sheets[0]?.characterId).toBeNull();

    const targetChat = await seedChat(db, "dst2");
    const hostUserId = await seedUser(db, castId<Handle>("newhost"));
    await createImportRpgGame(portabilityCtx(db))({
      chatId: targetChat,
      hostUserId,
      game: { ...exported, snapshots: [], journal: [], turnToolCalls: [], checkpoints: [] },
    });

    const games = await db.select().from(rpgGames).where(eq(rpgGames.chatId, targetChat));
    const sheets = await db
      .select()
      .from(rpgSheets)
      .where(eq(rpgSheets.gameId, games[0]?.id ?? castId<RpgGameId>("none")));
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.characterId).toBeNull();
    // The ORIGINAL sheet's user is gone; the room's new host holds it.
    expect(sheets[0]?.userId).toBe(hostUserId);
    expect(sheets[0]?.sheet.level).toBe(4);
  });
});
