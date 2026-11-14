// The host's strike on a remembered scene, through the composed root: a strike leaves the scene out of the next turn's
// prompt and restoring it brings it back; only the host strikes, and only the host gets strike ids; a strike outlives
// the scene being summarized again; a longer summary retelling a struck scene leaves with it; a strike names the span
// in every bucket, so it holds for every speaker of a group room, across a solo room gaining a second character, and
// over a speaker's own longer summary; a restore is room-bound; a strike survives a host handoff; a member's view
// stops at their history floor; and an empty view says why it is empty.
// Digests come from the production memory build; only the provider edges are scripted (`recall-world.ts`).
// @subject packages/server/src/domain/chat/verbs/memory-strikes.ts
// @subject packages/server/src/domain/chat/memory/recall/recall.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { MemoryItemView, MemoryView } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { nonEmpty, present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  readRoomCanon,
  SUMMARIZE_TRANSCRIPT_MARKER,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { CHAT_OP_CODES } from "#server/domain/chat/contract/errors.ts";
import { invitePerson } from "../persona-cache-physical.ts";
import { wireOf } from "../scenario-physical.ts";
import type { Arc, RecallRun } from "./recall-world.ts";
import { BLOCK_SIZE, blockOf, embeddingFor, FAN_OUT, generatedText, probe, recallTurn, TURN_INTENT, verdicts, world } from "./recall-world.ts";

/** Two scenes in one query, the storm scene weighted first; both clear the floor, so both are admitted unstruck. */
const BOTH = `Tell me about the scene. ${probe("bath")} ${probe("storm")}`;
const RECALL_KNOBS = { minScore: 0.05, queryWindow: 1, keywordMatch: false } as const;

function itemAt(view: MemoryView, tier: number, blockIdx: number): MemoryItemView {
  const item = view.items.find((candidate) => candidate.key.tier === tier && candidate.key.blockIdx === blockIdx);
  if (item === undefined) {
    throw new Error(`the memory view lists no item at tier ${tier}, block ${blockIdx}`);
  }
  return item;
}

function sceneOf(view: MemoryView, arc: Arc): MemoryItemView {
  return itemAt(view, 0, blockOf(arc));
}

/** Rebuild the room's memory after a canon change: the live pass after a turn, then the corpus sweep. */
async function redigest(w: Awaited<ReturnType<typeof world.build>>): Promise<void> {
  const keeper = present(w.h.characters[0]);
  const turn = await w.h.root.services.chat.forceCharacterTurn({ principal: w.h.owner, chatId: w.h.chatId, characterId: keeper.id, intent: TURN_INTENT });
  expect(turn.aborted).toBe(false);
  await w.h.root.settleBackground();
  await w.sweep({ kind: "memory-backfill", params: {} });
}

/** Rewrite the first transcript line of `arc`'s scene, keeping the marker the scripted summarizer keys on. */
async function editScene(h: ChatRoot, arc: Arc): Promise<void> {
  const line = (await readRoomCanon(h.root, h.owner, h.chatId)).find((message) => message.content.includes(`line-${arc}.`));
  if (line === undefined) {
    throw new Error(`the room holds no ${arc} line`);
  }
  await h.root.services.chat.editMessage({ principal: h.owner, chatId: h.chatId, messageId: line.id, content: `line-${arc}. The ${arc} was told again.` });
}

test("a struck scene leaves the next prompt while the scene beside it stays, and restoring it brings it back", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: RECALL_KNOBS } });
  const before = await recallTurn(w.h, BOTH);
  expect(before.prompt).toContain("arc-storm.");
  expect(before.prompt).toContain("arc-bath.");
  expect(verdicts(before.trace, "struck")).toEqual([]);

  const view = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  expect(view.status).toEqual({ kind: "ready" });
  const { strikeId } = await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: sceneOf(view, "storm").key });

  const struck = await recallTurn(w.h, BOTH);
  expect(struck.prompt).not.toContain("arc-storm.");
  expect(struck.prompt).toContain("arc-bath.");
  expect(verdicts(struck.trace, "struck").map((candidate) => candidate.blockIdx)).toEqual([blockOf("storm")]);
  const listed = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  expect(sceneOf(listed, "storm").strike).toEqual({ strikeId, changedSinceStrike: false });
  expect(sceneOf(listed, "bath").strike).toBeNull();
  // Striking the same item again is the standing strike, not a second one.
  await expect(w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: sceneOf(view, "storm").key })).resolves.toEqual({ strikeId });

  await w.h.caller.chat.restoreMemory({ chatId: w.h.chatId, strikeId });
  const restored = await recallTurn(w.h, BOTH);
  expect(restored.prompt).toContain("arc-storm.");
  expect(verdicts(restored.trace, "struck")).toEqual([]);
  expect(sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "storm").strike).toBeNull();
});

test("a member is refused a strike and a restore as not the host, and the host's strike lands in the same room", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  const member = await invitePerson(w.h);
  const memberView = await w.h.root.services.chat.memoryView({ principal: member, chatId: w.h.chatId });
  const item = sceneOf(memberView, "duel").key;

  await expect(w.h.root.services.chat.strikeMemory({ principal: member, chatId: w.h.chatId, item })).rejects.toMatchObject({ code: CHAT_OP_CODES.notHost });
  expect(sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "duel").strike).toBeNull();

  const { strikeId } = await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item });
  await expect(w.h.root.services.chat.restoreMemory({ principal: member, chatId: w.h.chatId, strikeId })).rejects.toMatchObject({
    code: CHAT_OP_CODES.notHost,
  });
  // The member reads that the scene is struck (the room's memory is the same for everyone in it), but only the host,
  // who alone restores, gets the strike id.
  expect(sceneOf(await w.h.root.services.chat.memoryView({ principal: member, chatId: w.h.chatId }), "duel").strike).toEqual({
    strikeId: null,
    changedSinceStrike: false,
  });
  expect(sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "duel").strike).toEqual({ strikeId, changedSinceStrike: false });
});

test("a strike outlives its scene being summarized again, and a key read before that summary is refused as stale", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: RECALL_KNOBS } });
  const read = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  const { strikeId } = await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: sceneOf(read, "storm").key });

  await editScene(w.h, "storm");
  await editScene(w.h, "bath");
  await redigest(w);
  const after = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  // The positive control: both scenes were summarized again, so their content hashes moved.
  expect(sceneOf(after, "storm").key.contentHash).not.toBe(sceneOf(read, "storm").key.contentHash);
  expect(sceneOf(after, "bath").key.contentHash).not.toBe(sceneOf(read, "bath").key.contentHash);
  expect(sceneOf(after, "storm").strike).toEqual({ strikeId, changedSinceStrike: true });

  const run = await recallTurn(w.h, BOTH);
  expect(run.prompt).not.toContain("arc-storm.");
  expect(run.prompt).toContain("arc-bath.");

  await expect(w.h.root.services.chat.strikeMemory({ principal: w.h.owner, chatId: w.h.chatId, item: sceneOf(read, "bath").key })).rejects.toMatchObject({
    code: CHAT_OP_CODES.memoryItemStale,
  });
  expect(sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "bath").strike).toBeNull();
  await expect(w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: sceneOf(after, "bath").key })).resolves.toMatchObject({
    strikeId: expect.any(String),
  });
});

test("striking a scene leaves out the consolidation retelling it, and restoring brings both back", async () => {
  await using w = await world.build({ mode: "tiered", maxTier: 1 });
  const view = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  // With a fan-out of two, the first tier-1 summary retells the first two scenes.
  const merged = itemAt(view, 1, 0);
  expect(merged.retellsStruck).toBe(false);
  const clear = await recallTurn(w.h, BOTH);
  expect(verdicts(clear.trace, "covers-struck")).toEqual([]);

  const { strikeId } = await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: sceneOf(view, "bath").key });
  const listed = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  expect(itemAt(listed, 1, 0)).toMatchObject({ strike: null, retellsStruck: true });
  // The control: the tier-1 summary over the next two scenes does not retell the struck one.
  expect(itemAt(listed, 1, 1).retellsStruck).toBe(false);
  const struck = await recallTurn(w.h, BOTH);
  expect(verdicts(struck.trace, "struck").map((candidate) => [candidate.tier, candidate.blockIdx])).toEqual([[0, blockOf("bath")]]);
  expect(verdicts(struck.trace, "covers-struck").map((candidate) => [candidate.tier, candidate.blockIdx])).toEqual([[1, 0]]);

  await w.h.caller.chat.restoreMemory({ chatId: w.h.chatId, strikeId });
  const restored = await recallTurn(w.h, BOTH);
  expect(verdicts(restored.trace, "struck")).toEqual([]);
  expect(verdicts(restored.trace, "covers-struck")).toEqual([]);
  expect(itemAt(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), 1, 0).retellsStruck).toBe(false);
});

/** The storm arc's consolidation, told apart from the other merged arcs so the prompt shows which one it carries. */
const STORM_ARC = "The storm arc was merged into one telling.";
const MERGED_FACTS = "The scenes merged into one arc.";

test("a longer summary over a struck scene stays out after the scene's own summary is dropped, and the view shows it struck", async () => {
  let blankStorm = false;
  await using w = await world.build({
    mode: "tiered",
    maxTier: 1,
    replyFor: (body) => {
      const scripted = generatedText(body);
      if (scripted.includes(MERGED_FACTS)) {
        return body.includes("arc-storm.") ? scripted.replace(MERGED_FACTS, STORM_ARC) : undefined;
      }
      // A blank re-summary of the edited storm scene: the build drops that summary and keeps its parent.
      return blankStorm && body.includes(SUMMARIZE_TRANSCRIPT_MARKER) && body.includes("line-storm.") ? "" : undefined;
    },
  });
  const view = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  const arc = present(view.items.find((item) => item.key.tier === 1 && item.text.includes(STORM_ARC)));
  const { strikeId } = await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: sceneOf(view, "storm").key });

  blankStorm = true;
  await editScene(w.h, "storm");
  await redigest(w);
  const after = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  // The premise: the scene's own summary is gone and the longer one built from it is still stored.
  expect(nonEmpty([...after.items]).some((item) => item.key.tier === 0 && item.key.blockIdx === blockOf("storm"))).toBe(false);
  expect(itemAt(after, 1, arc.key.blockIdx).text).toBe(arc.text);
  const run = await recallTurn(w.h, BOTH);
  expect(run.prompt).not.toContain(STORM_ARC);
  expect(verdicts(run.trace, "covers-struck").map((candidate) => [candidate.tier, candidate.blockIdx])).toEqual([[1, arc.key.blockIdx]]);
  // The view carries the strike on the longer summary it still leaves out, not as an unmatched strike.
  expect(itemAt(after, 1, arc.key.blockIdx)).toMatchObject({ strike: { strikeId, changedSinceStrike: true } });
  expect(after.unmatchedStrikes).toEqual([]);

  // The control: restored, the longer summary reaches the prompt.
  await w.h.caller.chat.restoreMemory({ chatId: w.h.chatId, strikeId });
  expect((await recallTurn(w.h, BOTH)).prompt).toContain(STORM_ARC);
});

test("a member with a join floor is not shown a summary straddling the floor, and the host is", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  // One more reply makes the canon a whole number of blocks, so the member's floor message ends the last block.
  await redigest(w);
  const joinedAt = (await readRoomCanon(w.h.root, w.h.owner, w.h.chatId)).length;
  expect(joinedAt % BLOCK_SIZE).toBe(0);
  const member = await invitePerson(w.h);
  await w.h.root.services.chat.setMemberHistoryVisibility({ principal: w.h.owner, chatId: w.h.chatId, userId: member.userId, visibility: "from-join" });
  // Every stored summary ends at or before the floor, so the member is told the memory predates them, not that it is
  // still being written; the host reads the same room as ready.
  expect(await w.h.root.services.chat.memoryView({ principal: member, chatId: w.h.chatId })).toMatchObject({
    status: { kind: "before-your-history" },
    items: [],
  });
  expect((await w.h.caller.chat.memoryView({ chatId: w.h.chatId })).status).toEqual({ kind: "ready" });
  // One exchange after the join fills the next block wholly above the floor.
  await recallTurn(w.h, BOTH);
  await w.h.root.settleBackground();
  const hostCanon = await readRoomCanon(w.h.root, w.h.owner, w.h.chatId);
  const memberCanon = await readRoomCanon(w.h.root, member, w.h.chatId);
  // The floor is the last message before the join, inclusive: the member reads from there on.
  expect(memberCanon.map((message) => message.id)).toEqual(hostCanon.slice(joinedAt - 1).map((message) => message.id));

  const straddler = joinedAt / BLOCK_SIZE - 1;
  const above = joinedAt / BLOCK_SIZE;
  const hostView = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  itemAt(hostView, 0, straddler);
  itemAt(hostView, 0, above);
  const memberView = await w.h.root.services.chat.memoryView({ principal: member, chatId: w.h.chatId });
  expect(memberView.items.map((item) => item.key.blockIdx)).toEqual([above]);
});

/** One forced turn by `characterId` after a user line naming both scenes: the prompt that speaker's reply was
 *  generated from, and the recall it recorded. */
async function speakerTurn(h: ChatRoot, characterId: CharacterId): Promise<RecallRun> {
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: BOTH });
  const before = h.root.app.recallRecorder.recent({ chatId: h.chatId }).at(-1)?.seq ?? 0;
  const { outcome, bodies } = await wireOf(h, () =>
    h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId, intent: TURN_INTENT }),
  );
  expect(outcome.aborted).toBe(false);
  const prompt = present(
    bodies
      .map((body) => JSON.stringify(body))
      .filter((body) => generatedText(body) === "The keeper answers.")
      .at(-1),
  );
  const trace = present(
    h.root.app.recallRecorder
      .recent({ chatId: h.chatId })
      .filter((record) => record.seq > before)
      .at(-1),
  ).trace;
  return { prompt, trace };
}

/** Seat a second character in the recall world's solo room and give each speaker its own scoped memory. */
async function seatScout(h: ChatRoot): Promise<CharacterId> {
  const scout = await h.root.services.character.create({
    principal: h.owner,
    input: createCharacterSchema.parse({ handle: "scout", name: "Scout", description: "The scout who rides ahead." }),
  });
  await h.caller.chat.addCharacterToChat({ chatId: h.chatId, characterId: scout.id });
  await h.caller.chat.setGroupConfig({ chatId: h.chatId, config: { output: "per-speaker", policy: "list", cardScope: "scoped" } });
  return scout.id;
}

/** A built turn mints the room's group character, so the shared bucket is no longer the first character. */
async function mintGroupBucket(h: ChatRoot, speaker: CharacterId, firstCharacter: CharacterId): Promise<void> {
  const minted = await h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: speaker, intent: TURN_INTENT });
  expect(minted.aborted).toBe(false);
  await h.root.settleBackground();
  expect(
    (await h.caller.chat.memoryView({ chatId: h.chatId })).items.some((item) => item.bucket === "shared" && item.key.scopedCharacterId !== firstCharacter),
  ).toBe(true);
}

test("a strike made in a solo room still holds for its character once a second character is seated", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: RECALL_KNOBS } });
  const keeper = present(w.h.characters[0]);
  await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "storm").key });
  const scout = await seatScout(w.h);
  await mintGroupBucket(w.h, scout, keeper.id);

  const run = await speakerTurn(w.h, keeper.id);
  expect(run.prompt).not.toContain("arc-storm.");
  expect(run.prompt).toContain("arc-bath.");
});

test("a strike made after a second character is seated, before the group memory exists, still holds once it does", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: RECALL_KNOBS } });
  const keeper = present(w.h.characters[0]);
  const scout = await seatScout(w.h);
  // The shared bucket is still the first character here: the host strikes the first character's own summary.
  const storm = sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "storm");
  expect(storm).toMatchObject({ bucket: "shared", key: { scopedCharacterId: keeper.id } });
  await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: storm.key });
  await mintGroupBucket(w.h, scout, keeper.id);

  const run = await speakerTurn(w.h, keeper.id);
  expect(run.prompt).not.toContain("arc-storm.");
  expect(run.prompt).toContain("arc-bath.");
});

test("striking the shared summary leaves the scene out of every speaker's prompt, one entry carries it, and restore brings it back for all", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0, scout: true });
  await w.h.caller.settings.updateAppSettings({ partial: { memoryDefaults: RECALL_KNOBS } });
  const speakers = w.h.characters.map((character) => character.id);
  expect(speakers).toHaveLength(2);
  const view = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  const copies = (v: MemoryView): readonly MemoryItemView[] => v.items.filter((item) => item.key.tier === 0 && item.key.blockIdx === blockOf("storm"));
  // The control on the premise: the group and each character hold their own summary of the scene.
  expect(copies(view).map((item) => item.key.scopedCharacterId)).toEqual(expect.arrayContaining(speakers));
  const shared = present(copies(view).find((item) => item.bucket === "shared"));
  const { strikeId } = await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: shared.key });

  for (const speaker of speakers) {
    const run = await speakerTurn(w.h, speaker);
    expect(run.prompt).not.toContain("arc-storm.");
    expect(run.prompt).toContain("arc-bath.");
  }
  const listed = copies(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }));
  expect(listed.filter((item) => item.strike !== null)).toEqual([
    expect.objectContaining({ bucket: "shared", strike: { strikeId, changedSinceStrike: false } }),
  ]);
  expect(nonEmpty(listed.filter((item) => item.strike === null)).every((item) => item.retellsStruck)).toBe(true);
  // Striking another copy of the same scene answers the standing strike.
  const scoped = present(listed.find((item) => item.bucket === "scoped"));
  await expect(w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: scoped.key })).resolves.toEqual({ strikeId });

  await w.h.caller.chat.restoreMemory({ chatId: w.h.chatId, strikeId });
  for (const speaker of speakers) {
    expect((await speakerTurn(w.h, speaker)).prompt).toContain("arc-storm.");
  }
  expect(nonEmpty(copies(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }))).every((item) => item.strike === null && !item.retellsStruck)).toBe(true);
});

test("a struck shared scene also leaves out a speaker's own longer summary covering it", async () => {
  await using w = await world.build({ mode: "tiered", maxTier: 1, scout: true });
  const keeper = present(w.h.characters[0]);
  const view = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  const shared = present(view.items.find((item) => item.bucket === "shared" && item.key.tier === 0 && item.key.blockIdx === blockOf("bath")));
  // The premise: the keeper keeps its own tier-1 summary over the first two scenes.
  const ownArc = present(view.items.find((item) => item.key.scopedCharacterId === keeper.id && item.key.tier === 1 && item.key.blockIdx === 0));
  expect(ownArc.retellsStruck).toBe(false);
  await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: shared.key });

  const run = await speakerTurn(w.h, keeper.id);
  expect(run.prompt).not.toContain("arc-bath.");
  expect(verdicts(run.trace, "covers-struck")).toEqual(
    expect.arrayContaining([expect.objectContaining({ scopedCharacterId: keeper.id, tier: 1, blockIdx: 0 })]),
  );
  // The control: the keeper's tier-1 summary over the next two scenes does not retell the struck one.
  expect(verdicts(run.trace, "covers-struck")).not.toEqual(
    expect.arrayContaining([expect.objectContaining({ scopedCharacterId: keeper.id, tier: 1, blockIdx: 1 })]),
  );
});

test("a member who hosts another room cannot restore this room's strike by passing its id under their own room", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  const member = await invitePerson(w.h);
  const { strikeId } = await w.h.caller.chat.strikeMemory({
    chatId: w.h.chatId,
    item: sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "storm").key,
  });
  const { chat: own } = await w.h.root.services.chat.startChat({ principal: member, characterIds: [], opening: "none" });
  await w.h.root.services.chat.restoreMemory({ principal: member, chatId: own.id, strikeId });
  expect(sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "storm").strike).toEqual({ strikeId, changedSinceStrike: false });
  // The control: the same id under this room, by its host, lifts it.
  await w.h.caller.chat.restoreMemory({ chatId: w.h.chatId, strikeId });
  expect(sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "storm").strike).toBeNull();
});

/** The verdicts recall gave the storm scene's summaries on every turn recorded after `since`. */
function stormVerdicts(h: ChatRoot, since: number): readonly string[] {
  return h.root.app.recallRecorder
    .recent({ chatId: h.chatId })
    .filter((record) => record.seq > since)
    .flatMap((record) => record.trace.candidates.filter((c) => c.tier === 0 && c.blockIdx === blockOf("storm")).map((c) => c.verdict));
}

test("a former host deleting the card a strike was made on leaves the strike standing for the new host", async () => {
  await using w = await world.build({ mode: "mixA", maxTier: 0, scout: true });
  const h = w.h;
  await h.caller.settings.updateAppSettings({ partial: { memoryDefaults: RECALL_KNOBS } });
  const keeper = present(h.characters[0]).id;
  const keeperStorm = present(
    (await h.caller.chat.memoryView({ chatId: h.chatId })).items.find(
      (item) => item.key.tier === 0 && item.key.blockIdx === blockOf("storm") && item.key.scopedCharacterId === keeper,
    ),
  );
  const { strikeId } = await h.caller.chat.strikeMemory({ chatId: h.chatId, item: keeperStorm.key });

  // A default handoff copies no card: the former host's characters leave the room but stay in their library.
  const member = await invitePerson(h);
  await seedCorpusConnections(h.root, member);
  await h.root.services.settings.updateUserSettingsSection({ principal: member, input: { section: "memory", patch: { enabled: true } } });
  await h.root.services.chat.nominateHostHandoff({ principal: h.owner, chatId: h.chatId, userId: member.userId });
  await h.root.services.chat.acceptHostHandoff({ principal: member, chatId: h.chatId });
  const seat = async (handle: string, name: string): Promise<CharacterId> => {
    const card = await h.root.services.character.create({
      principal: member,
      input: createCharacterSchema.parse({ handle, name, description: `The ${handle}.` }),
    });
    await h.root.services.chat.addCharacterToChat({ principal: member, chatId: h.chatId, characterId: card.id });
    return card.id;
  };
  const rider = await seat("rider", "Rider");
  await seat("scribe", "Scribe");
  await h.root.services.chat.setGroupConfig({ principal: member, chatId: h.chatId, config: { output: "per-speaker", policy: "list", cardScope: "scoped" } });
  const riderTurn = async (): Promise<void> => {
    await h.root.services.chat.commitMessage({ principal: member, chatId: h.chatId, content: BOTH });
    const turn = await h.root.services.chat.forceCharacterTurn({ principal: member, chatId: h.chatId, characterId: rider, intent: TURN_INTENT });
    expect(turn.aborted).toBe(false);
    await h.root.settleBackground();
  };
  // The new host's own memory of the room builds, and recall leaves its storm summary out.
  await riderTurn();
  await w.sweep({ kind: "memory-backfill", params: {} });
  const built = h.root.app.recallRecorder.recent({ chatId: h.chatId }).at(-1)?.seq ?? 0;
  await riderTurn();
  expect(nonEmpty([...stormVerdicts(h, built)]).every((verdict) => verdict === "struck")).toBe(true);

  // The former host, now a member, deletes the card the strike was made on.
  await h.root.services.character.remove({ principal: h.owner, characterId: keeper });
  const deleted = h.root.app.recallRecorder.recent({ chatId: h.chatId }).at(-1)?.seq ?? 0;
  await riderTurn();
  expect(nonEmpty([...stormVerdicts(h, deleted)]).every((verdict) => verdict === "struck")).toBe(true);
  // With the struck copy's character gone, the shared copy carries the strike, and says it is not the summary struck.
  const view = await h.root.services.chat.memoryView({ principal: member, chatId: h.chatId });
  expect(view.items.filter((item) => item.strike !== null)).toEqual([
    expect.objectContaining({ bucket: "shared", strike: { strikeId, changedSinceStrike: true } }),
  ]);
  expect(view.unmatchedStrikes).toEqual([]);
});

test("deleting both characters whose copies of a struck scene the host struck succeeds, and the one strike stands", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0, scout: true });
  const [keeper, scout] = w.h.characters.map((character) => character.id);
  const copies = (await w.h.caller.chat.memoryView({ chatId: w.h.chatId })).items.filter(
    (item) => item.key.tier === 0 && item.key.blockIdx === blockOf("storm"),
  );
  const copyOf = (characterId: CharacterId | undefined): MemoryItemView => present(copies.find((item) => item.key.scopedCharacterId === characterId));
  const { strikeId } = await w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: copyOf(keeper).key });
  // The second character's copy is the same span: the room keeps one strike for it.
  await expect(w.h.caller.chat.strikeMemory({ chatId: w.h.chatId, item: copyOf(scout).key })).resolves.toEqual({ strikeId });

  for (const characterId of [keeper, scout]) {
    await w.h.root.services.character.remove({ principal: w.h.owner, characterId: present(characterId) });
  }
  const view = await w.h.caller.chat.memoryView({ chatId: w.h.chatId });
  expect(view.items.filter((item) => item.strike !== null)).toEqual([
    expect.objectContaining({ bucket: "shared", strike: { strikeId, changedSinceStrike: true } }),
  ]);
  expect(view.unmatchedStrikes).toEqual([]);
});

test("a strike survives a host handoff: the new host sees and restores it, and the old host is refused", async () => {
  await using w = await world.build({ mode: "mixB", maxTier: 0 });
  const { strikeId } = await w.h.caller.chat.strikeMemory({
    chatId: w.h.chatId,
    item: sceneOf(await w.h.caller.chat.memoryView({ chatId: w.h.chatId }), "storm").key,
  });
  const member = await invitePerson(w.h);
  await w.h.root.services.settings.updateUserSettingsSection({ principal: member, input: { section: "memory", patch: { enabled: true } } });
  await w.h.root.services.chat.nominateHostHandoff({ principal: w.h.owner, chatId: w.h.chatId, userId: member.userId });
  await w.h.root.services.chat.acceptHostHandoff({ principal: member, chatId: w.h.chatId });

  expect(sceneOf(await w.h.root.services.chat.memoryView({ principal: member, chatId: w.h.chatId }), "storm").strike).toEqual({
    strikeId,
    changedSinceStrike: false,
  });
  await expect(w.h.root.services.chat.restoreMemory({ principal: w.h.owner, chatId: w.h.chatId, strikeId })).rejects.toMatchObject({
    code: CHAT_OP_CODES.notHost,
  });
  await w.h.root.services.chat.restoreMemory({ principal: member, chatId: w.h.chatId, strikeId });
  expect(sceneOf(await w.h.root.services.chat.memoryView({ principal: member, chatId: w.h.chatId }), "storm").strike).toBeNull();
});

/** A room whose memory never built: `lines` transcript lines, the host's switch on, the app in a retrieval mode. */
async function unbuiltRoom(lines: number): Promise<ChatRoot> {
  return await createChatRoot({
    providerFetch: async (input, init) =>
      await createCorpusProviderExecution({
        modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
        embedding: embeddingFor,
        structuredReplies: CORPUS_STRUCTURED_REPLIES,
        images: [],
        chatText: generatedText,
      }).execute(new Request(input, init)),
    memoryEnabled: true,
    memoryDefaults: { mode: "mixB", blockSize: BLOCK_SIZE, verbatimWindow: 0, fanOut: FAN_OUT, maxTier: 0 },
    characters: [createCharacterSchema.parse({ handle: "keeper", name: "Keeper", description: "The keeper of the caravan ledger." })],
    transcript: Array.from({ length: lines }, (_, index) => ({ role: "assistant" as const, content: `Line ${index}.` })),
  });
}

test("an empty view says why: memory off for the app, off by the host, or on with nothing remembered yet", async () => {
  await using long = await unbuiltRoom(BLOCK_SIZE * 2);
  const read = (): Promise<MemoryView> => long.caller.chat.memoryView({ chatId: long.chatId });
  expect(await read()).toEqual({ status: { kind: "pending" }, items: [], unmatchedStrikes: [], recentWindowStartsAt: null });
  await long.caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: false } });
  expect((await read()).status).toEqual({ kind: "off", reason: "host-off" });
  // The app's switch outranks the host's: with both off, the view names the app.
  await long.caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "off" } } });
  expect((await read()).status).toEqual({ kind: "off", reason: "app-off" });
  await long.caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  expect((await read()).status).toEqual({ kind: "off", reason: "app-off" });

  await using short = await unbuiltRoom(BLOCK_SIZE - 1);
  expect(await short.caller.chat.memoryView({ chatId: short.chatId })).toEqual({
    status: { kind: "too-short" },
    items: [],
    unmatchedStrikes: [],
    recentWindowStartsAt: null,
  });
});
