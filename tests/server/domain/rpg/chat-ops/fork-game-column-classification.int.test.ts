// chat-ops/fork-game — every rpg column and every rpg_games.config field is classified, no copied column is silently dropped, and a non-game source forks plain.

import { rpgGameConfigSchema, rpgGameFeaturesSchema } from "@orb/contracts/rpg";
import { rpgCheckpoints, rpgGames, rpgJournal, rpgSheets, rpgSnapshots } from "@orb/db";
import type { Handle, MessageId, MessageVariantId, RpgGameId, RpgSnapshotId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import { getTableColumns } from "drizzle-orm";
import { actorWithWallet, expect, liteConfig, makeRpgService, quest, seedChat, seedMessage, seedUser, test } from "../_support.ts";
import {
  findGameByChat,
  insertCheckpoint,
  insertGame,
  insertJournalEntry,
  insertSnapshot,
  listAllJournal,
  listCheckpoints,
  listSheets,
  listSnapshots,
  seedForkTarget,
  upsertSheet,
} from "./_fork-game-support.ts";

test("EVERY rpg column is classified — a new column lands in its fork*Values or the copy takes it blind", () => {
  // Read off the LIVE drizzle tables, so a schema addition reds here even if the `tsc` ratchet in fork-game.ts
  // were worked around (a cast, a widened type). Two-sided: a dropped column reds too.
  expect(Object.keys(getTableColumns(rpgGames)).sort()).toEqual(
    ["id", "chatId", "mode", "status", "sessionNumber", "gmUserId", "gmPresetId", "config", "createdAt", "updatedAt"].sort(),
  );
  expect(Object.keys(getTableColumns(rpgSheets)).sort()).toEqual(["id", "gameId", "characterId", "userId", "sheet", "createdAt", "updatedAt"].sort());
  expect(Object.keys(getTableColumns(rpgSnapshots)).sort()).toEqual(
    [
      "id",
      "gameId",
      "messageId",
      "variantId",
      "asOfMessageId",
      "clock",
      "calendarDate",
      "location",
      "weather",
      "presentCharacters",
      "recentEvents",
      "actorState",
      "trackerValues",
      "quests",
      "plot",
      "fieldLocks",
      "committed",
      "createdAt",
    ].sort(),
  );
  expect(Object.keys(getTableColumns(rpgJournal)).sort()).toEqual(
    ["id", "gameId", "type", "label", "title", "content", "variantId", "sourceMessageId", "createdAt"].sort(),
  );
  expect(Object.keys(getTableColumns(rpgCheckpoints)).sort()).toEqual(["id", "gameId", "snapshotId", "label", "trigger", "createdAt"].sort());
});

/** The DROPPED arm of the allow-list's own failure mode (the class that lost `chats.userMacroValues` on the
 *  chat fork): a builder that simply omits a COPIED column type-checks fine and silently nulls real data. This
 *  census populates EVERY nullable column of the four row planes with a distinctive value and compares the copy
 *  field-by-field, ACCUMULATING offenders so one run names the whole regression. */
function droppedColumns(src: Record<string, unknown>, copy: Record<string, unknown>, copied: readonly string[]): string[] {
  return copied.filter((column) => JSON.stringify(copy[column]) !== JSON.stringify(src[column]));
}

test("no COPIED column is silently dropped — every populated row-plane column survives the fork", async () => {
  const db = await freshDb();
  const gm = await seedUser(db, castId<Handle>("censusgm"));
  const chatId = await seedChat(db, "src_census");
  const gameId = castId<RpgGameId>("rpg_game_census");
  await insertGame(db, {
    id: gameId,
    chatId,
    mode: "lite",
    status: "active",
    sessionNumber: 7, // NOT the born default — a dropped counter would read 1 and look plausible.
    gmUserId: gm,
    gmPresetId: null,
    config: liteConfig(),
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "beat one" });
  // EVERY nullable snapshot column populated distinctively (a null-vs-value copy bug is otherwise invisible).
  const snapshotId = castId<RpgSnapshotId>("rpg_snapshot_census");
  await insertSnapshot(db, {
    id: snapshotId,
    gameId,
    messageId,
    variantId,
    asOfMessageId: null,
    clock: { day: 4, hour: 21, minute: 30 },
    calendarDate: "3rd of Frostmoon",
    location: "the drowned chapel",
    weather: { type: "rain", label: "torrential sleet" },
    presentCharacters: ["npc:mira"],
    recentEvents: ["the bell rang twice"],
    actorState: [actorWithWallet("mira", 12, 3)],
    trackerValues: { morale: { value: 4, items: null, max: 10 } },
    quests: [quest("ford", { name: "Cross the ford" })],
    plot: { act: 2, title: "The reckoning", acts: [{ title: "Arrival", summary: "s1" }] },
    fieldLocks: { "ambient.location": true },
    committed: 1,
    createdAt: FROZEN_AT_MS,
  });
  await insertJournalEntry(db, {
    id: castId("rpg_journal_census"),
    gameId,
    type: "custom",
    label: "omen", // the R4c free gloss — born "" on the built-ins, so a drop hides behind the default
    title: "The bell",
    content: "It rang twice.",
    variantId,
    sourceMessageId: messageId,
    createdAt: FROZEN_AT_MS,
  });
  await upsertSheet(db, {
    id: castId("rpg_sheet_census"),
    gameId,
    characterId: null,
    userId: gm,
    sheet: { className: "Warden", attributes: { grit: 3 }, flavor: "scarred", level: 5, trackerGrants: ["bound_will"], trackerRevokes: ["morale"] },
    now: FROZEN_AT_MS,
  });
  await insertCheckpoint(db, { id: castId("rpg_checkpoint_census"), gameId, snapshotId, label: "the ford", trigger: "manual", createdAt: FROZEN_AT_MS });

  const { forkChatId, slotIdMap, variantIdMap } = await seedForkTarget(db, "census", { messageId, variantId });
  const h = makeRpgService(db);
  await h.chatOps.forkGame({
    sourceChatId: chatId,
    newChatId: forkChatId,
    slotIdMap,
    variantIdMap,
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  const srcGame = await findGameByChat(db, chatId);
  const forkGame = await findGameByChat(db, forkChatId);
  // @orb-waive no-test-fabrication(RpgGameId): baselined when the gate widened to value casts; burn-down item 906.
  const fg = forkGame?.id as RpgGameId;
  // rpg_games — `gmUserId` is deliberately nulled (lite is seatless) and `gmPresetId`/`config` have their own
  // gates, so the COPIED set is what is left.
  expect(droppedColumns({ ...srcGame }, { ...forkGame }, ["mode", "status", "sessionNumber"])).toEqual([]);
  // rpg_snapshots — every state column but the hidden-span-belted `recentEvents` (proven by its own test).
  const srcSnap = (await listSnapshots(db, gameId))[0];
  const forkSnap = (await listSnapshots(db, fg))[0];
  expect(
    droppedColumns({ ...srcSnap }, { ...forkSnap }, [
      "clock",
      "calendarDate",
      "location",
      "weather",
      "presentCharacters",
      "actorState",
      "trackerValues",
      "quests",
      "plot",
      "fieldLocks",
      "committed",
    ]),
  ).toEqual([]);
  // rpg_journal — `content` runs the belt (its own test); the other three are member-readable via listJournal.
  const srcJournal = (await listAllJournal(db, gameId))[0];
  const forkJournal = (await listAllJournal(db, fg))[0];
  expect(droppedColumns({ ...srcJournal }, { ...forkJournal }, ["type", "label", "title"])).toEqual([]);
  // rpg_sheets — the whole sheet blob is member-projected by getTrackerView, so it copies whole.
  const srcSheet = (await listSheets(db, gameId))[0];
  const forkSheet = (await listSheets(db, fg))[0];
  expect(droppedColumns({ ...srcSheet }, { ...forkSheet }, ["characterId", "userId", "sheet"])).toEqual([]);
  // rpg_checkpoints — label + trigger are on the member-gated listCheckpoints row.
  const srcCp = (await listCheckpoints(db, gameId))[0];
  const forkCp = (await listCheckpoints(db, fg))[0];
  expect(droppedColumns({ ...srcCp }, { ...forkCp }, ["label", "trigger"])).toEqual([]);
});

test("EVERY rpg_games.config FIELD is classified — the ratchet the table-level allow-list cannot see", () => {
  // `config` is ONE column: `Required<typeof rpgGames.$inferInsert>` proves the column is named and proves
  // NOTHING about what is inside it. This census is the blob's own tripwire, read off the LIVE zod shapes, so
  // a new field must be classified in `stripConfigForForker`/`stripFeaturesForForker` before it can ship.
  expect(Object.keys(rpgGameConfigSchema.shape).sort()).toEqual(
    [
      "engaged",
      // #862 — the RULESET setting; classified COPIED in `stripConfigForForker` (it rides `getGame`'s
      // member-safe `publicConfig`, and the dice row every member sees derives from it).
      "ruleset",
      "statProfile",
      "trackers",
      "lite",
      "extractionMode",
      // 0511 — a host-only enum scalar, COPIED like the extraction-depth knobs.
      "stateCaptureVehicle",
      "extractionContext",
      "extractionWindowTokens",
      "reconcileEveryBeats",
      "dateMode",
      "features",
      "userMacros",
    ].sort(),
  );
  expect(Object.keys(rpgGameFeaturesSchema.shape).sort()).toEqual(
    [
      "relationshipHints",
      "journalTypeHints",
      "deception",
      "omniscience",
      "hiddenContentReveal",
      "recentBeatsKeepLast",
      "immersiveHtml",
      "immersiveHtmlInteractive",
      "cardKeepLastX",
      "cyoa",
      "cyoaChoiceBehavior",
      "plotProgression",
    ].sort(),
  );
});

test("a NON-GAME source is a no-op (cloned:false), no pointer — the fork stays plain", async () => {
  const db = await freshDb();
  const plain = await seedChat(db, "plain_src");
  const forkChatId = await seedChat(db, "fork_plain");

  const h = makeRpgService(db);
  const result = await h.chatOps.forkGame({
    sourceChatId: plain,
    newChatId: forkChatId,
    slotIdMap: new Map<MessageId, MessageId>(),
    variantIdMap: new Map<MessageVariantId, MessageVariantId>(),
    forker: { userId: castId<UserId>("user_mallory"), readsHidden: false },
  });

  expect(result.cloned).toBe(false);
  expect(await findGameByChat(db, forkChatId)).toBeUndefined();
  expect(h.fakes.pointers).toHaveLength(0);
});
