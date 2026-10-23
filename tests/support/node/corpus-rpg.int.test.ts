// @subject tests/support/node/corpus-rpg.ts
// @subject tests/support/node/corpus-rpg-schedules.ts
// @subject packages/server/src/domain/rpg/verbs/journal/edit-journal-entry.ts
// @subject packages/server/src/domain/rpg/persistence/journal.ts
import { CADENCE_INTERVAL_MS } from "@orb/contracts/workloads";
import { assertReferentialIntegrity, closeDb } from "@orb/db";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { seedCorpusRpg } from "./corpus-rpg.ts";
import { freshHeldDb } from "./db.ts";

test("native RPG hand variants preserve objective identity, release removed locks and restore unbound state through a real narrator anchor", async () => {
  await using root = await createServerHarness();
  const result = await seedCorpusRpg(root);
  expect(result.bornSnapshots).toEqual([]);
  expect(result.born.ambient).toBeNull();
  expect(result.refused).toMatchObject({ ok: false });
  expect(result.authored).toEqual({ ok: true });
  const [first, second] = result.game.config.statProfile.attributes;
  if (first === undefined || second === undefined) {
    throw new Error("native d20 game has fewer than two attributes");
  }
  const value = result.game.config.statProfile.range.max;
  expect(result.mergedSheets.sheets).toMatchObject([
    { gameId: result.game.id, userId: root.ownerId, characterId: null, sheet: { attributes: { [first.key]: value, [second.key]: value }, level: 3 } },
  ]);
  expect(result.clearedSheets.sheets.map((row) => row.sheet.attributes)).toEqual([{ [second.key]: value }]);
  expect(result.clearedSheets.sheets.map((row) => row.sheet.level)).toEqual([null]);
  const quest = result.questBorn.quests[0];
  const objective = quest?.objectives[0];
  if (quest === undefined || objective === undefined) {
    throw new Error("native quest birth produced no objective");
  }
  expect(result.questProgress.quests).toMatchObject([
    {
      id: quest.id,
      objectives: [
        { id: objective.id, text: "Find the shuttle", completed: true },
        { text: "Thread the loom", completed: false },
      ],
    },
  ]);
  expect(result.objectiveDeleted.quests).toMatchObject([{ id: quest.id, objectives: [{ text: "Thread the loom" }] }]);
  expect(result.objectiveDeleted.quests[0]?.objectives).toHaveLength(1);
  const lock = `quests.${quest.id}`;
  expect(result.questProgress.lockedPaths).toContain(lock);
  expect(result.questDeleted.quests).toEqual([]);
  expect(result.questDeleted.lockedPaths).not.toContain(lock);
  expect(result.deletedSnapshot.fieldLocks).not.toContain(lock);
  expect(result.snapshot).toMatchObject({ messageId: null, variantId: null, asOfMessageId: null, committed: 1, location: "Orbital loom" });
  expect(result.restoredSnapshot).toMatchObject({ gameId: result.game.id, messageId: null, variantId: null, committed: 1, location: "Orbital loom" });
  expect(result.restoredSnapshot.id).not.toBe(result.snapshot.id);
  expect(result.restoredSnapshot.asOfMessageId).not.toBeNull();
  expect(result.reads.messages.messages.map((message) => message.id)).toEqual([result.restoredSnapshot.asOfMessageId]);
  expect(result.reads.tracker.ambient).toMatchObject({ location: "Orbital loom", calendarDate: "Founder's Day" });
  expect(result.reads.tracker.quests).toEqual(result.questProgress.quests);
  expect(result.reads.checkpoints.map((checkpoint) => checkpoint.snapshotId)).toContain(result.restoredCheckpoint.snapshotId);
  expect(result.reads.game.id).toBe(result.game.id);
  expect(result.reads.journal).toEqual([]);
  expect(result.reads.toolCalls).toEqual([]);
  await assertReferentialIntegrity(root.db);
});

test("a native journal type change clears its custom-only label instead of leaving a stale builtin gloss", async () => {
  await using root = await createServerHarness();
  const result = await seedCorpusRpg(root);
  expect(result.journal).toMatchObject({ type: "custom", label: "Travel", variantId: null, sourceMessageId: null });
  expect(result.journalEdited).toMatchObject([{ id: result.journal.id, type: "note", label: "" }]);
});

test("native journal edits retain, replace and empty custom labels while refusing foreign-game entry IDs", async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const { chat } = await caller.chat.startChat({ characterIds: [], opening: "none" });
  const chatId = chat.id;
  await caller.rpg.createGame({ chatId, mode: "lite" });
  const entryId = await caller.rpg.addJournalEntry({ chatId, type: "custom", label: "Travel", title: "Shuttle", content: "Found the shuttle." });
  await caller.rpg.editJournalEntry({ chatId, entryId, patch: { content: "Carried the shuttle." } });
  expect(await caller.rpg.listJournal({ chatId })).toMatchObject([{ id: entryId, label: "Travel", content: "Carried the shuttle." }]);
  await caller.rpg.editJournalEntry({ chatId, entryId, patch: { label: "Craft" } });
  expect(await caller.rpg.listJournal({ chatId })).toMatchObject([{ id: entryId, type: "custom", label: "Craft" }]);
  await caller.rpg.editJournalEntry({ chatId, entryId, patch: { label: "" } });
  expect(await caller.rpg.listJournal({ chatId })).toMatchObject([{ id: entryId, type: "custom", label: "" }]);
  await caller.rpg.editJournalEntry({ chatId, entryId, patch: { type: "note", label: "Ignored builtin gloss" } });
  expect(await caller.rpg.listJournal({ chatId })).toMatchObject([{ id: entryId, type: "note", label: "" }]);
  await caller.rpg.editJournalEntry({ chatId, entryId, patch: { label: "Still ignored" } });
  expect(await caller.rpg.listJournal({ chatId })).toMatchObject([{ id: entryId, type: "note", label: "" }]);
  await caller.rpg.editJournalEntry({ chatId, entryId, patch: { type: "custom", label: "Recovered" } });
  const retained = await caller.rpg.listJournal({ chatId });
  expect(retained).toMatchObject([{ id: entryId, type: "custom", label: "Recovered" }]);
  const other = await caller.chat.startChat({ characterIds: [], opening: "none" });
  await caller.rpg.createGame({ chatId: other.chat.id, mode: "lite" });
  await expect(caller.rpg.editJournalEntry({ chatId: other.chat.id, entryId, patch: { content: "Foreign rewrite" } })).rejects.toMatchObject({
    code: "NOT_FOUND",
  });
  expect(await caller.rpg.listJournal({ chatId })).toEqual(retained);
  expect(await caller.rpg.listJournal({ chatId: other.chat.id })).toEqual([]);
});

test("held real journal updates normalize against the current row rather than clobbering a competing kind change", async () => {
  const held = await freshHeldDb();
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => closeDb(held.db));
  const root = ownership.use(await createServerHarness({ db: held.db }));
  const caller = await root.internalCallerFor(root.ownerId);
  const { chat } = await caller.chat.startChat({ characterIds: [], opening: "none" });
  const chatId = chat.id;
  await caller.rpg.createGame({ chatId, mode: "lite" });
  const entryId = await caller.rpg.addJournalEntry({ chatId, type: "note", title: "Shuttle", content: "Found the shuttle." });
  const gate = held.hold(/^update "rpg_journal"/u);
  const textEdit = caller.rpg.editJournalEntry({ chatId, entryId, patch: { content: "Carried the shuttle." } });
  try {
    await gate.reached;
    gate.disarm();
    await caller.rpg.editJournalEntry({ chatId, entryId, patch: { type: "custom", label: "Craft" } });
    expect(await caller.rpg.listJournal({ chatId })).toMatchObject([{ id: entryId, type: "custom", label: "Craft", content: "Found the shuttle." }]);
  } finally {
    gate.release();
    await textEdit;
  }
  expect(await caller.rpg.listJournal({ chatId })).toMatchObject([{ id: entryId, type: "custom", label: "Craft", content: "Carried the shuttle." }]);
  const labelGate = held.hold(/^update "rpg_journal"/u);
  const labelEdit = caller.rpg.editJournalEntry({ chatId, entryId, patch: { label: "Travel" } });
  try {
    await labelGate.reached;
    labelGate.disarm();
    await caller.rpg.editJournalEntry({ chatId, entryId, patch: { type: "note" } });
    expect(await caller.rpg.listJournal({ chatId })).toMatchObject([{ id: entryId, type: "note", label: "" }]);
  } finally {
    labelGate.release();
    await labelEdit;
  }
  expect(await caller.rpg.listJournal({ chatId })).toMatchObject([{ id: entryId, type: "note", label: "", content: "Carried the shuttle." }]);
});

test("graph schedule timers preserve future cancellation and paused cadence before one due recurring run succeeds", async () => {
  await using root = await createServerHarness();
  const { schedules: result } = await seedCorpusRpg(root);
  expect(result.queued).toMatchObject({ ownerId: root.ownerId, status: "queued" });
  expect(result.beforeDue).toMatchObject({ id: result.queued.id, status: "queued", scheduledAt: result.queued.scheduledAt });
  expect(result.cancelled).toMatchObject({ id: result.queued.id, status: "cancelled" });
  expect(result.schedule.nextRunAt).toBe(result.schedule.createdAt + CADENCE_INTERVAL_MS.daily);
  expect(result.retuned).toMatchObject({ id: result.schedule.id, cadence: "hourly", nextRunAt: result.schedule.createdAt + CADENCE_INTERVAL_MS.hourly });
  expect(result.disabled.enabled).toBe(false);
  expect(result.paused).toEqual([result.disabled]);
  expect(result.pausedJobs.map((job) => [job.id, job.status])).toEqual([[result.queued.id, "cancelled"]]);
  expect(result.resumed.enabled).toBe(true);
  expect(result.afterTick).toMatchObject([{ id: result.schedule.id, lastRunAt: expect.any(Number) }]);
  const fired = result.afterTick[0];
  if (fired === undefined || fired.lastRunAt === null) {
    throw new Error("native schedule did not fire");
  }
  expect(fired.nextRunAt).toBe(fired.lastRunAt + CADENCE_INTERVAL_MS.hourly);
  expect(result.completed).toMatchObject([
    { id: result.admitted[0]?.id, kind: "reconcile-stats", ownerId: root.ownerId, mode: "singular", status: "succeeded" },
  ]);
  expect(result.stopped).toMatchObject({
    id: result.schedule.id,
    ownerId: root.ownerId,
    cadence: "hourly",
    enabled: false,
    lastRunAt: fired.lastRunAt,
    nextRunAt: fired.nextRunAt,
  });
  expect(result.deletedSchedule).toMatchObject({ ownerId: root.ownerId, enabled: false, lastRunAt: null });
  expect(result.deletedSchedule.id).not.toBe(result.schedule.id);
  expect(result.finalSchedules).toEqual([result.stopped]);
});
