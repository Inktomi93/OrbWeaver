// Native hand-state variants stay private; every canon write and routed projection belongs to production.
import { createCharacterSchema } from "@orb/contracts/character";
import { rpgSnapshots } from "@orb/db";
import { eq } from "drizzle-orm";
import { seedCorpusRpgSchedules } from "./corpus-rpg-schedules.ts";
import { seedRpgJournalEntry, seedRpgSheets } from "./factories/rows/rpg.ts";
import { captureRpgSnapshot, seedRpgCheckpointRows, seedRpgGameRows } from "./factories/rows.ts";
import type { ServerTestHarness } from "./server.ts";

type CorpusCaller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type Tracker = Awaited<ReturnType<CorpusCaller["rpg"]["getTrackerView"]>>;
type Snapshot = Awaited<ReturnType<typeof captureRpgSnapshot>>;
interface SeededCorpusRpg {
  readonly character: Awaited<ReturnType<CorpusCaller["character"]["create"]>>;
  readonly room: Awaited<ReturnType<CorpusCaller["chat"]["startChat"]>>;
  readonly game: Awaited<ReturnType<typeof seedRpgGameRows>>;
  readonly born: Tracker;
  readonly bornSnapshots: readonly Snapshot[];
  readonly refused: Awaited<ReturnType<CorpusCaller["rpg"]["editSnapshot"]>>;
  readonly authored: Awaited<ReturnType<CorpusCaller["rpg"]["editSnapshot"]>>;
  readonly mergedSheets: Awaited<ReturnType<typeof seedRpgSheets>>;
  readonly clearedSheets: Awaited<ReturnType<typeof seedRpgSheets>>;
  readonly questBorn: Tracker;
  readonly questProgress: Tracker;
  readonly objectiveDeleted: Tracker;
  readonly questDeleted: Tracker;
  readonly journal: Awaited<ReturnType<typeof seedRpgJournalEntry>>;
  readonly journalEdited: Awaited<ReturnType<CorpusCaller["rpg"]["listJournal"]>>;
  readonly checkpoint: Awaited<ReturnType<typeof seedRpgCheckpointRows>>;
  readonly snapshot: Snapshot;
  readonly deletedSnapshot: Snapshot;
  readonly restoredCheckpoint: Awaited<ReturnType<typeof seedRpgCheckpointRows>>;
  readonly restoredSnapshot: Snapshot;
  readonly reads: {
    readonly game: Awaited<ReturnType<CorpusCaller["rpg"]["getGame"]>>;
    readonly tracker: Tracker;
    readonly config: Awaited<ReturnType<CorpusCaller["rpg"]["getConfigView"]>>;
    readonly journal: Awaited<ReturnType<CorpusCaller["rpg"]["listJournal"]>>;
    readonly checkpoints: Awaited<ReturnType<CorpusCaller["rpg"]["listCheckpoints"]>>;
    readonly reveal: Awaited<ReturnType<CorpusCaller["rpg"]["revealHidden"]>>;
    readonly toolCalls: Awaited<ReturnType<CorpusCaller["rpg"]["listTurnToolCalls"]>>;
    readonly messages: Awaited<ReturnType<CorpusCaller["chat"]["listMessages"]>>;
  };
  readonly schedules: Awaited<ReturnType<typeof seedCorpusRpgSchedules>>;
}

/** Author hand canon and restore from its real checkpoint; never fabricate a state anchor or variant. */
export async function seedCorpusRpg(root: ServerTestHarness): Promise<SeededCorpusRpg> {
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const character = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "corpus-rpg", name: "Loom traveller", description: "A traveller repairing the orbital loom." }),
  });
  const room = await caller.chat.startChat({ characterIds: [character.id], opening: "none" });
  const chatId = room.chat.id;
  const params = { principal, chatId };
  const game = await seedRpgGameRows(root, { ...params, mode: "lite", ruleset: "d20" });
  const born = await caller.rpg.getTrackerView({ chatId });
  const bornSnapshots = await root.db.select().from(rpgSnapshots).where(eq(rpgSnapshots.gameId, game.id));
  const refused = await caller.rpg.editSnapshot({ chatId, patch: { actorState: [] } });
  const actorRef = { kind: "user", userId: principal.userId } as const;
  const [first, second] = game.config.statProfile.attributes;
  if (first === undefined || second === undefined) {
    throw new Error("native d20 game has fewer than two attributes");
  }
  const value = game.config.statProfile.range.max;
  await seedRpgSheets(root, { ...params, actorRef, patch: { attributes: { [first.key]: value }, level: 3 } });
  const mergedSheets = await seedRpgSheets(root, { ...params, actorRef, patch: { attributes: { [second.key]: value } } });
  const clearedSheets = await seedRpgSheets(root, { ...params, actorRef, patch: { attributes: { [first.key]: null }, level: null } });
  const authored = await caller.rpg.editSnapshot({ chatId, patch: { location: "Orbital loom", calendarDate: "Founder's Day" } });
  const questId = await caller.rpg.upsertQuest({ chatId, name: "Repair the loom", objectives: [{ text: "Find the shuttle" }] });
  const questBorn = await caller.rpg.getTrackerView({ chatId });
  const objective = questBorn.quests.find((quest) => quest.id === questId)?.objectives[0];
  if (objective === undefined) {
    throw new Error("native quest birth produced no objective");
  }
  await caller.rpg.editQuestObjective({ chatId, questId, op: { kind: "add", text: "Thread the loom" } });
  await caller.rpg.editQuestObjective({ chatId, questId, op: { kind: "setCompleted", objectiveId: objective.id, completed: true } });
  const questProgress = await caller.rpg.getTrackerView({ chatId });
  const journal = await seedRpgJournalEntry(root, {
    ...params,
    type: "custom",
    label: "Travel",
    title: "The missing shuttle",
    content: "The traveller found the orbital shuttle.",
  });
  const checkpoint = await seedRpgCheckpointRows(root, { ...params, label: "Shuttle found" });
  const snapshot = await captureRpgSnapshot(root.db, checkpoint.snapshotId);
  await caller.rpg.editJournalEntry({ chatId, entryId: journal.id, patch: { type: "note" } });
  const journalEdited = await caller.rpg.listJournal({ chatId });
  await caller.rpg.editQuestObjective({ chatId, questId, op: { kind: "delete", objectiveId: objective.id } });
  const objectiveDeleted = await caller.rpg.getTrackerView({ chatId });
  await caller.rpg.deleteQuest({ chatId, questId });
  const questDeleted = await caller.rpg.getTrackerView({ chatId });
  const deletedCheckpoint = await seedRpgCheckpointRows(root, { ...params, label: "Quest removed" });
  const deletedSnapshot = await captureRpgSnapshot(root.db, deletedCheckpoint.snapshotId);
  await caller.rpg.editSnapshot({ chatId, patch: { location: "Harbor" } });
  await caller.rpg.restoreCheckpoint({ chatId, checkpointId: checkpoint.id });
  const restoredCheckpoint = await seedRpgCheckpointRows(root, { ...params, label: "Restored loom" });
  const restoredSnapshot = await captureRpgSnapshot(root.db, restoredCheckpoint.snapshotId);
  await caller.rpg.deleteJournalEntry({ chatId, entryId: journal.id });
  const reads = {
    game: await caller.rpg.getGame({ chatId }),
    tracker: await caller.rpg.getTrackerView({ chatId }),
    config: await caller.rpg.getConfigView({ chatId }),
    journal: await caller.rpg.listJournal({ chatId }),
    checkpoints: await caller.rpg.listCheckpoints({ chatId }),
    reveal: await caller.rpg.revealHidden({ chatId }),
    toolCalls: await caller.rpg.listTurnToolCalls({ chatId }),
    messages: await caller.chat.listMessages({ chatId }),
  };
  const schedules = await seedCorpusRpgSchedules(root);
  return {
    character,
    room,
    game,
    born,
    bornSnapshots,
    refused,
    authored,
    mergedSheets,
    clearedSheets,
    questBorn,
    questProgress,
    objectiveDeleted,
    questDeleted,
    journal,
    journalEdited,
    checkpoint,
    snapshot,
    deletedSnapshot,
    restoredCheckpoint,
    restoredSnapshot,
    reads,
    schedules,
  };
}
