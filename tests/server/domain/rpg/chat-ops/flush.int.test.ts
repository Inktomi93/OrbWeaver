// tests/server/domain/rpg/chat-ops/flush — the turn-completion FLUSH + the delivery-mode branch (rpg-design/05
// §2.4-2.5 + §4.6). Both modes funnel through the accumulator: `cheap` = the injected `runToolRound` op stages
// its delta first, THEN take + write; `folded` = the character turn's own calls are folded instead (and fall back
// to that same round). Journal entries stamp the committed `{variantId, sourceMessageId}`. A turn that staged
// nothing writes no snapshot.
//
// The flush READ-BACK regressions (stickler F1/F2) live here too — the flush IS the write→read seam, and the
// tools int suite only asserts `staging.peek()` (the accumulator), never a durable flush + a `getTrackerView`
// read-back (the gap that let two write↔read bugs ship). F1 — a negative pool delta on a fresh pool must NOT
// mint `max <= 0` (the contract belt `pools[].max >= 1`), and a contract-INVALID assembled state is DROPPED at
// the write boundary (canon uncorrupted). F2 — a party-member write (addressed by NAME) lands under the participant
// ref key, not an orphan `npc:<name>` the panel never reads. (The pure applier F1-mint / F2-resolve units live
// in `tools/apply.test.ts`.)

import type { RpgRecordedToolCall } from "@orb/contracts/rpg";
import type { ChatId, ChatTurnId, Handle, MessageVariantId, RpgQuestId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { resolveModelCapability } from "../../../../../packages/server/src/domain/connection/catalog/resolve-model-capability.ts";
import type { RpgParticipantActor } from "../../../../../packages/server/src/domain/rpg/index.ts";
import { rpgToolDefinitions } from "../../../../../packages/server/src/domain/rpg/index.ts";
import { listJournalByVariant } from "../../../../../packages/server/src/domain/rpg/persistence/journal.ts";
import { findSnapshotByVariant, listSnapshots } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { findTurnToolCallsByVariant } from "../../../../../packages/server/src/domain/rpg/persistence/turn-tool-calls.ts";
import { defaultSnapshotState } from "../../../../../packages/server/src/domain/rpg/substrate/default-state.ts";
import { buildActorRefIndex, extractionToStateDelta } from "../../../../../packages/server/src/domain/rpg/tools/apply.ts";
import type { ToolExecutionContext } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { freshDb } from "../../../../support/db.ts";
import { makeModelCapability, makeResolvedConnection } from "../../../../support/factories/resolved-connection.ts";
import { expect, pinExtractionMode, principal, seedLiteGame, seedMessage, test, turnConnection } from "../_support.ts";

const TURN: ChatTurnId = castId<ChatTurnId>("chat_turn_t1");
const POOLS_MAX_RE = /pools|max/i;

function exec(chatId: ChatId, turnId: ChatTurnId): ToolExecutionContext {
  return { principal: principal(castId<Handle>("host")), triggeredBy: castId("user_host"), chatId, turnId, membership: null };
}

test("cheap mode: the dedicated TOOL ROUND is called, its delta is staged + flushed (owner ruling 2026-07-27)", async () => {
  const db = await freshDb();
  // Cheap mode runs a DEDICATED tool round post-commit — the
  // parallel tool calls fold to a delta the flush stages + writes, NOT mid-turn-staged tools on the char turn.
  const toolRoundDelta = { statePatch: { location: "the cave mouth" }, journal: [] };
  const { chatId, gameId, h } = await seedLiteGame(db, { toolRoundDelta });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  h.fakes.busEvents.length = 0; // drop the createGame/updateConfig emits — assert the flush emit alone

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  // The tool-round op fired with the committed identifiers; nothing was folded (the cheap arm never folds).
  expect(h.fakes.toolRoundCalls).toEqual([{ chatId, messageId, variantId, reconcile: false }]);
  expect(h.fakes.foldCalls).toHaveLength(0);
  const snap = await findSnapshotByVariant(db, variantId);
  expect(snap?.location).toBe("the cave mouth");
  expect(snap?.committed).toBe(0); // born uncommitted — the next user send locks it in
  expect(snap?.gameId).toBe(gameId);
  // The lifecycle brackets the durable plane event so the panel stays pending until the write lands.
  expect(h.fakes.busEvents).toEqual([
    { type: "stateRoundStarted", chatId, turnId: TURN },
    { type: "snapshotPatched", chatId, snapshotId: snap?.id },
    { type: "stateRoundSettled", chatId, turnId: TURN },
  ]);
});

test("continue replaces its variant snapshot from the current head instead of inserting or rebasing before the slot", async () => {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db, {
    toolRoundDelta: { statePatch: { location: "the kitchen", recentEvents: ["tea was served"] }, journal: [] },
  });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());
  const before = await findSnapshotByVariant(db, variantId);
  expect(before?.location).toBe("the kitchen");

  // Continue extends this SAME variant. Its delta is based on the state the continuation prompt saw (the
  // current head), so an omitted location must carry forward. The write must replace the one keyed row rather
  // than collide with the partial unique index by attempting a second insert.
  h.fakes.toolRoundDelta = { statePatch: { recentEvents: ["tea was served", "Mira pocketed the key"] }, journal: [] };
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, castId<ChatTurnId>("chat_turn_continue"), turnConnection({ kind: "continue" }));

  const after = await findSnapshotByVariant(db, variantId);
  expect(after?.id).toBe(before?.id);
  expect(after?.location).toBe("the kitchen");
  expect(after?.recentEvents).toEqual(["tea was served", "Mira pocketed the key"]);
  expect(await listSnapshots(db, gameId)).toHaveLength(1);
});

test("a CONTINUE's journal entries APPEND beside the first half's — the same-variant re-flush is not an idempotent replace (#1468 item 3)", async () => {
  const db = await freshDb();
  // THE REFUTATION PIN. #1468 item 3 read `writeStagedSnapshotAndJournal`'s unconditional journal INSERT beside
  // its snapshot UPSERT as a duplicate-on-retry defect, and proposed a conflict target (or a delete-then-insert)
  // keyed on `variantId`. That fix would be DATA LOSS: the only reachable second flush of one variant is a
  // CONTINUE (`chat-ops/index.ts` fires `flushTurn` once per completed turn, and `staging.take` deletes the
  // bucket, so no staged entry can be flushed twice), and a continuation's entries are NEW beats of the same
  // slot — keying the write on the variant would erase the first half's archive on every continue. The failed-
  // flush retry is covered by the #723 pin below: the batch rolls the whole beat back, so its retry writes one
  // row, not two. This test is what makes both halves red if a later reader "fixes" the append away.
  const { chatId, h } = await seedLiteGame(db, {
    toolRoundDelta: {
      statePatch: { location: "the kitchen" },
      journal: [{ type: "location", label: "", title: "Arrival", content: "They reached the kitchen." }],
    },
  });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());
  expect(await listJournalByVariant(db, variantId)).toHaveLength(1);

  h.fakes.toolRoundDelta = { statePatch: {}, journal: [{ type: "combat", label: "", title: "Ambush", content: "The cook drew a knife." }] };
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, castId<ChatTurnId>("chat_turn_continue"), turnConnection({ kind: "continue" }));

  const entries = await listJournalByVariant(db, variantId);
  expect(entries.map((e) => e.title).sort()).toEqual(["Ambush", "Arrival"]);
  // One SNAPSHOT (the upsert did replace in place) beside TWO journal rows — the two planes have different
  // per-variant cardinalities on purpose, which is the whole distinction the item collapsed.
  expect(await findSnapshotByVariant(db, variantId)).toBeDefined();
});

test("F2 (readonly gate): a turn connection without the mode's writer capability fires NO round and writes nothing", async () => {
  const db = await freshDb();
  // Both surviving modes need `tools`. A turn connection whose capability LACKS them is readonly
  // (manual-steering) — the flush must skip the round (no `runToolRound` call, no per-turn failing spend) and
  // write no snapshot. The verdict reads THIS connection (F1 — never a re-resolve of the global default).
  const toolRoundDelta = { statePatch: { location: "unreachable" }, journal: [] };
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  h.fakes.busEvents.length = 0;

  const readonlyConn = turnConnection({
    connection: makeResolvedConnection({ capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true } }) }), // tools ABSENT
  });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, readonlyConn);

  expect(h.fakes.toolRoundCalls).toHaveLength(0); // the round was gated OUT before any model call
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  expect(h.fakes.busEvents).toEqual([]);
});

test("the post-commit round's JOURNAL entries flush stamped with the committed variant (+ both bus emits)", async () => {
  const db = await freshDb();
  const toolRoundDelta = {
    statePatch: { location: "the obsidian tower" },
    journal: [{ type: "location", label: "", title: "Arrival", content: "They reached the tower." }],
  };
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  h.fakes.busEvents.length = 0; // drop the createGame emit — assert the flush emits alone

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  // The round fired with the committed identifiers.
  expect(h.fakes.toolRoundCalls).toEqual([{ chatId, messageId, variantId, reconcile: false }]);
  // Its state delta landed on the committed variant's snapshot.
  const snap = await findSnapshotByVariant(db, variantId);
  expect(snap?.location).toBe("the obsidian tower");
  // Its journal entry landed stamped with the committed variant + source message (lineage-keyed, §2.5).
  const entries = await listJournalByVariant(db, variantId);
  expect(entries).toHaveLength(1);
  expect(entries[0]?.title).toBe("Arrival");
  expect(entries[0]?.sourceMessageId).toBe(messageId);
  // §4.9: a state+journal flush emits BOTH `snapshotPatched` and `journalChanged`.
  expect(h.fakes.busEvents).toEqual([
    { type: "stateRoundStarted", chatId, turnId: TURN },
    { type: "snapshotPatched", chatId, snapshotId: snap?.id },
    { type: "journalChanged", chatId },
    { type: "stateRoundSettled", chatId, turnId: TURN },
  ]);
});

test("#723 a journal insert interruption rolls back the snapshot, then retry commits the complete flush", async () => {
  const db = await freshDb();
  const toolRoundDelta = {
    statePatch: { location: "the interrupted tower" },
    journal: [{ type: "location", label: "", title: "Interrupted", content: "The whole beat must commit together." }],
  };
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await db.run(sql.raw("CREATE TRIGGER fail_rpg_journal BEFORE INSERT ON rpg_journal BEGIN SELECT RAISE(ABORT, 'injected journal interruption'); END"));

  await expect(h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection())).rejects.toThrow();
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  expect(await listJournalByVariant(db, variantId)).toEqual([]);

  await db.run(sql.raw("DROP TRIGGER fail_rpg_journal"));
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());
  expect((await findSnapshotByVariant(db, variantId))?.location).toBe("the interrupted tower");
  expect(await listJournalByVariant(db, variantId)).toHaveLength(1);
});

test("a turn that staged nothing writes NO snapshot (byte-identical non-writing turn)", async () => {
  const db = await freshDb();
  // Empty round delta (the default) → nothing to write.
  const { chatId, h } = await seedLiteGame(db);
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  h.fakes.busEvents.length = 0; // drop the createGame emit — a non-writing flush must add nothing

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  // No durable plane event, but the live lifecycle still closes cleanly.
  expect(h.fakes.busEvents).toEqual([
    { type: "stateRoundStarted", chatId, turnId: TURN },
    { type: "stateRoundSettled", chatId, turnId: TURN },
  ]);
});

test("#1493 SETTLE: the write boundary announces AFTER the durable write — and on every arm, including nothing-staged", async () => {
  // WHY THIS EXISTS. `onStateRoundPath` is raised at DISPATCH (`resolveStateRound` picking the vehicle), so
  // until this hook nothing in the trail said the extraction was OVER; the live-loop e2e barriered on that
  // dispatch event and released while the round was still running. The settle must therefore be (a) AFTER the
  // durable write and (b) TOTAL — a turn that wrote nothing settles too, or the barrier hangs on the quiet
  // beat that is the 8B model's most common outcome.
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  await rpgToolDefinitions(h.ctx)[2]?.handler({ location: "the settled hall" }, exec(chatId, TURN)); // [2] = update_scene
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  h.fakes.busEvents.length = 0;

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  // The snapshot LANDED, and exactly one settle names it.
  expect((await findSnapshotByVariant(db, variantId))?.location).toBe("the settled hall");
  expect(h.fakes.flushSettles).toHaveLength(1);
  expect(h.fakes.flushSettles[0]).toMatchObject({ chatId, turnId: TURN, outcome: "wrote", droppedReason: null });
  // ORDER: `snapshotPatched` is emitted only after the snapshot+journal commit returns, so a settle that
  // already counted it is a settle that happened after the durable write — the property the barrier needs.
  expect(h.fakes.busEvents.map((event) => event.type)).toContain("snapshotPatched");
  const patchedAt = h.fakes.busEvents.findIndex((event) => event.type === "snapshotPatched");
  expect(h.fakes.flushSettles[0]?.busEventsAtSettle).toBeGreaterThan(patchedAt);
});

test("#1493 SETTLE: a turn that staged NOTHING still settles — the quiet beat is terminal, not a hang", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  // The one difference from the arm above: nothing was WRITTEN, and nothing was DROPPED either — a quiet
  // beat is not a backstop refusal, and conflating them would make the empty delta read as data loss.
  expect(h.fakes.flushSettles).toEqual([{ chatId, turnId: TURN, outcome: "no-writes", droppedReason: null, busEventsAtSettle: expect.any(Number) }]);
});

test("#1493 SETTLE is TOTAL: a THROWING disclosure write still settles, and still says the snapshot WROTE", async () => {
  // THE RESIDUAL (verifier v-L2-tooling). The settle used to be raised inside the write boundary's own
  // `finally`, AFTER `await recordTurnCalls(...)` — so a disclosure write that threw took the settle down
  // with it and the e2e barrier hung to its 75 s timeout on a turn whose snapshot had ALREADY committed.
  // Fault injection is the real write target: drop the disclosure table and the insert throws for real.
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { foldedDelta: { statePatch: { location: "the ford" }, journal: [] } });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await db.run(sql`DROP TABLE rpg_turn_tool_calls`);

  const verdict = await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection({ terminalToolCalls: FOLDED_CALLS })).then(
    () => "resolved",
    () => "threw",
  );

  // The turn DID fail (the disclosure write is not optional) — and that is exactly the arm under test.
  expect(verdict).toBe("threw");
  // The snapshot committed BEFORE the throw, so the settle must say `wrote` — reporting `failed` here would
  // send a reader looking for a write that is on disk.
  expect((await findSnapshotByVariant(db, variantId))?.location).toBe("the ford");
  expect(h.fakes.flushSettles).toHaveLength(1);
  expect(h.fakes.flushSettles[0]).toMatchObject({ chatId, turnId: TURN, outcome: "wrote", droppedReason: null });
});

test("#1493 SETTLE is TOTAL: the F2 readonly game settles immediately — it will never extract", async () => {
  // No round runs at all here, so without a settle the trail says nothing and a barrier waits for an event
  // that can never come. `readonly` is the honest member: not a failure, not a quiet beat — no write path.
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta: { statePatch: { location: "unreachable" }, journal: [] } });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  h.fakes.busEvents.length = 0;

  const readonlyConn = turnConnection({
    connection: makeResolvedConnection({ capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true } }) }), // tools ABSENT
  });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, readonlyConn);

  expect(h.fakes.toolRoundCalls).toHaveLength(0);
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  expect(h.fakes.flushSettles).toEqual([{ chatId, turnId: TURN, outcome: "readonly", droppedReason: null, busEventsAtSettle: 0 }]);
  // …and the panel lifecycle is still untouched: nothing was pending, so nothing announces.
  expect(h.fakes.busEvents).toEqual([]);
});

test("F1: a negative pool delta on a fresh pool flushes a CONTRACT-VALID row (getTrackerView does not throw)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  // The model narrates "the wizard spends 3 mana" — a pool decremented before it was ever established.
  await rpgToolDefinitions(h.ctx)[0]?.handler({ targetRef: "Wizard", trackerDeltas: [{ key: "mana", delta: -3 }] }, exec(chatId, TURN));

  // Flush the turn onto a committed assistant slot — this is where the poisoned row used to commit.
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  // The persisted row is CONTRACT-VALID — the tracker value is TOTAL (`{value,items}` whole), so a partial
  // write can never strand a sibling on it, and the ceiling lives on the def where nothing can drift from it.
  const snap = await findSnapshotByVariant(db, variantId);
  const wizard = snap?.actorState?.find((a) => a.actorRef.kind === "npc" && a.actorRef.npcKey === "wizard");
  expect(wizard?.volatile.trackerValues["mana"]).toEqual({ value: -3, items: null, max: null });
  // And the member tracker read no longer THROWS (the poison used to brick every later read forever).
  await expect(h.service.getTrackerView({ principal: principal(castId<Handle>("host")), chatId })).resolves.toBeDefined();
});

test("F1 (structural backstop): a would-be-INVALID staged state DROPS the whole flush, never commits", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  // Force a contract-INVALID state past the appliers (a hostile/buggy direct stage) — the backstop must refuse it.
  h.ctx.staging.ensure(TURN, {
    clock: null,
    calendarDate: null,
    location: "",
    weather: null,
    presentCharacters: [],
    recentEvents: [],
    actorState: [
      {
        actorRef: { kind: "npc", npcKey: "broken" },
        // A `max: 0` meter ceiling violates the contract belt (`max >= 1`) — parse-on-read would throw AFTER
        // the insert commits, so the backstop must refuse it at the write boundary.
        volatile: { trackerValues: { hp: { value: 1, items: null, max: 0 } }, conditions: [], inventory: [], wallet: [], status: "" },
      },
    ],
    trackerValues: {},
    quests: [],
    plot: null,
    fieldLocks: null,
  });
  h.ctx.staging.stageJournal(TURN, { type: "note", label: "", title: "beat", content: "c" });

  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  // The invalid state was REFUSED at the write boundary — NO snapshot committed (canon uncorrupted).
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  // The journal rode the same atomic drop — no orphan beat referencing a snapshot that never landed.
  const journal = await h.service.listJournal({ principal: principal(castId<Handle>("host")), chatId, limit: 50 });
  expect(journal).toEqual([]);
  // VISIBILITY (the fix): the drop was OBSERVED, never silent — the recorder captured it WITH the field-level
  // reason (a state round that produced applicable output vanishing without a signal was the exact violation).
  expect(h.fakes.flushDrops).toHaveLength(1);
  expect(h.fakes.flushDrops[0]?.variantId).toBe(variantId);
  expect(h.fakes.flushDrops[0]?.reason).toMatch(POOLS_MAX_RE);
  // …and the DROP still SETTLES (#1493), carrying the same field-level reason: `droppedReason` on the trace
  // has a real emitter here, which is why the field exists at all. A barrier that only released on a
  // successful write would hang forever on exactly the turn a reader most needs to see.
  expect(h.fakes.flushSettles).toHaveLength(1);
  expect(h.fakes.flushSettles[0]?.outcome).toBe("dropped");
  expect(h.fakes.flushSettles[0]?.droppedReason).toMatch(POOLS_MAX_RE);
});

test("ROUND-TRIP (the exec's replayed output): extraction JSON → delta → flush → getTrackerView reads it back", async () => {
  const db = await freshDb();
  // The EXACT captured extraction the exec replayed (a schema-valid, enum-constrained, applicable delta
  // the F1 diagnosis said was silently dropped): a scene write + a party status on the player + a journal beat.
  // This pins the FULL round-trip lands (no silent write-boundary drop for a legitimate extraction).
  const player: RpgParticipantActor = { actorRef: { kind: "user", userId: castId("user_host") }, name: "You" };
  const toolRoundDelta = extractionToStateDelta(
    defaultSnapshotState(),
    {
      party: [{ targetRef: "player", status: "Bleeding (Critical)" }],
      inventory: [],
      scene: { location: "cave", weather: { type: "fog", label: "nightfall mist" } },
      trackers: [],
      quests: [],
      // TITLE-LESS journal entry (the blocker fix, ruling #10): the 8B drops the nested-required `title`; the
      // entry must still land, its title DERIVED from the content head. This is the exact 5/8-failure shape.
      journal: [{ type: "combat", content: "Wounded by the troll as it swung its club." }],
    },
    { item: () => "item_x", quest: () => castId<RpgQuestId>("q_x"), objective: () => "obj_x" },
    buildActorRefIndex([player]),
  );
  const { chatId, h } = await seedLiteGame(db, { participants: [player], toolRoundDelta });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  // No silent drop — the flush COMMITTED (the whole point of the fix's root-cause half).
  expect(h.fakes.flushDrops).toEqual([]);
  // The panel READS BACK every plane the extraction wrote (the coordinator's bar: replayed output → tracker view).
  const view = await h.service.getTrackerView({ principal: principal(castId<Handle>("host")), chatId });
  expect(view.ambient?.location).toBe("cave");
  expect(view.ambient?.weather?.type).toBe("fog");
  expect(view.ambient?.weather?.label).toBe("nightfall mist");
  const you = view.actors.find((a) => a.actorRef.kind === "user");
  expect(you?.volatile?.status).toBe("Bleeding (Critical)");
  // The title-less journal entry LANDED with a DERIVED title (the content head) — not dropped.
  const entries = await listJournalByVariant(db, variantId);
  expect(entries).toHaveLength(1);
  expect(entries[0]?.title).toBe("Wounded by the troll as it swung its club.");
});

test("FLUSH BARRIER: a fast re-send BLOCKS on the prior in-flight flush, then assembles off FRESH state (not stale)", async () => {
  const db = await freshDb();
  // Turn 1's round writes a beat + a location. The barrier must make turn 2's gather WAIT for that flush
  // before it reads state — otherwise turn 2 assembles its reminder off the STALE (pre-flush) empty state (the
  // exec's live-confirmed race: ex2 read beats:0 while ex1's flush was in flight, now that the state round is a
  // real 0.8-2.9s call).
  const toolRoundDelta = {
    statePatch: { location: "the sunken cathedral" },
    journal: [{ type: "location", label: "", title: "Descent", content: "They descended into the cathedral." }],
  };
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  // HOLD turn 1's flush in-flight: the state-round gate blocks until we release it.
  let releaseFlush = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseFlush = resolve;
  });

  // Turn 1 completes — register + await the flush, but it hangs on the gate. Fire-and-forget (as the engine does).
  const flush1 = h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  // Turn 2's gather starts while turn 1's flush is STILL in flight. It must block on the barrier.
  let gatherResolved = false;
  const gather2 = h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false }).then((result) => {
    gatherResolved = true;
    return result;
  });
  // Give the event loop a tick — the gather must NOT have resolved yet (it is parked on the barrier).
  await Promise.resolve();
  await Promise.resolve();
  expect(gatherResolved).toBe(false); // BLOCKED on the in-flight flush — the barrier held

  // Release turn 1's flush; now turn 2's gather unblocks and reads the just-committed state.
  releaseFlush();
  await flush1;
  const gathered = await gather2;
  expect(gatherResolved).toBe(true);
  // Turn 2's reminder assembled off FRESH state — it names the location turn 1's flush wrote (not stale/empty).
  expect(gathered?.injections[0]?.content).toContain("the sunken cathedral");
  // No timeout fired — the flush settled well within the bound.
  expect(h.fakes.barrierTimeouts).toEqual([]);
});

test("FLUSH BARRIER: register is SYNCHRONOUS — an IMMEDIATE re-send (no await between) still sees the in-flight flush", async () => {
  const db = await freshDb();
  // The narrow race the exec caught: `onTurnCompleted` used to `await findGameByChat` BEFORE registering, so a
  // scripted immediate re-send beat the await → `awaitInFlight` saw NO entry → assembled stale. The fix
  // registers synchronously at the top. This pins the timing: kick off the gather in the SAME synchronous block
  // as onTurnCompleted (before onTurnCompleted's internal game-lookup await resolves) and it MUST still block.
  const toolRoundDelta = { statePatch: { location: "the drowned crypt" }, journal: [] };
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  let releaseFlush = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseFlush = resolve;
  });

  // NO await between these two — the immediate-resend timing. `register` must have already run (synchronously,
  // before onTurnCompleted's first await) so the gather kicked off on the very next line sees the entry.
  const flush1 = h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());
  let gatherResolved = false;
  const gather2 = h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false }).then((r) => {
    gatherResolved = true;
    return r;
  });

  await Promise.resolve();
  await Promise.resolve();
  expect(gatherResolved).toBe(false); // the synchronous register made the entry visible before any await

  releaseFlush();
  await flush1;
  const gathered = await gather2;
  expect(gathered?.injections[0]?.content).toContain("the drowned crypt"); // fresh, not stale
  expect(h.fakes.barrierTimeouts).toEqual([]);
});

test("F2: update_party on a PARTICIPANT character surfaces under the participant key in getTrackerView", async () => {
  const db = await freshDb();
  // A participant character "Kael" — the gather reminder + tracker view key volatile by the participant ref. The id is a
  // REAL TypeID (the contract `characterId` belt validates it at flush; a malformed fake id would be refused).
  const kael: RpgParticipantActor = { actorRef: { kind: "character", characterId: mintTypeId(ID_PREFIX.character) }, name: "Kael" };
  const { chatId, h } = await seedLiteGame(db, { participants: [kael] });

  // The model addresses the party member by NAME (it never sees ids).
  await rpgToolDefinitions(h.ctx)[0]?.handler({ targetRef: "Kael", trackerDeltas: [{ key: "focus", delta: 7 }] }, exec(chatId, TURN));
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  const view = await h.service.getTrackerView({ principal: principal(castId<Handle>("host")), chatId });
  const kaelView = view.actors.find((a) => a.actorRef.kind === "character");
  // The write SURFACES under the participant character's key — not an orphan npc:Kael the panel never reads.
  expect(kaelView?.name).toBe("Kael");
  expect(kaelView?.volatile?.trackerValues["focus"]).toEqual({ value: 7, items: null, max: null });
  // And there is NO orphan npc:Kael entry.
  expect(view.actors.some((a) => a.actorRef.kind === "npc" && a.actorRef.npcKey === "Kael")).toBe(false);
});

test("F2: update_inventory on a PARTICIPANT user surfaces its wallet under the participant key", async () => {
  const db = await freshDb();
  const player: RpgParticipantActor = { actorRef: { kind: "user", userId: castId("user_host") }, name: "Player" };
  const { chatId, h } = await seedLiteGame(db, { participants: [player] });

  await rpgToolDefinitions(h.ctx)[1]?.handler({ targetRef: "Player", walletDeltas: [{ name: "gold", delta: 20 }] }, exec(chatId, TURN));
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  const view = await h.service.getTrackerView({ principal: principal(castId<Handle>("host")), chatId });
  const playerView = view.actors.find((a) => a.actorRef.kind === "user");
  expect(playerView?.volatile?.wallet).toEqual([{ name: "gold", amount: 20 }]);
});

// ── RECONCILE CADENCE (crunchy-cluster §1.3, W-C) — the consumption homes in flush.ts (`isReconcileBeat`), so
//    its tests fold in here (test-layout: one source, one mirror). Every `reconcileEveryBeats`-th flush FORCES a
//    full re-emission (the round receives `reconcile:true`); the others run the incremental pass. `0` = opt-out.
//    The counter is DERIVED from a snapshot COUNT at `stageStateRound` (never a stamped counter): this beat's
//    ordinal is `count(prior snapshots) + 1`, so a reconcile fires on ordinal N, 2N, 3N…. createGame writes NO
//    born snapshot, so beat 1 = ordinal 1.

/** Drive one beat: a fresh assistant slot + a non-empty round delta so the flush WRITES a snapshot (each
 *  written snapshot advances the beat counter). Returns the `reconcile` flag the round was called with. */
async function driveReconcileBeat(h: Awaited<ReturnType<typeof seedLiteGame>>["h"], chatId: ChatId, seq: number): Promise<boolean> {
  const turnId = castId<ChatTurnId>(`chat_turn_beat_${seq}`);
  const { messageId, variantId } = await seedMessage(h.ctx.db, chatId, seq, { role: "assistant" });
  const before = h.fakes.toolRoundCalls.length;
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, turnId, turnConnection());
  return h.fakes.toolRoundCalls[before]?.reconcile ?? false;
}

test("reconcile cadence N=2: fires on beats 2 and 4, incremental on beats 1 and 3", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta: { statePatch: { location: "somewhere" }, journal: [] } });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "cheap", patch: { reconcileEveryBeats: 2 } });

  expect(await driveReconcileBeat(h, chatId, 1)).toBe(false); // ordinal 1: 1 % 2 !== 0 → incremental
  expect(await driveReconcileBeat(h, chatId, 2)).toBe(true); //  ordinal 2: 2 % 2 === 0 → RECONCILE
  expect(await driveReconcileBeat(h, chatId, 3)).toBe(false); // ordinal 3: 3 % 2 !== 0 → incremental
  expect(await driveReconcileBeat(h, chatId, 4)).toBe(true); //  ordinal 4: 4 % 2 === 0 → RECONCILE
});

test("reconcile cadence N=0: NEVER fires (opt-out) — every beat is incremental", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta: { statePatch: { location: "somewhere" }, journal: [] } });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "cheap", patch: { reconcileEveryBeats: 0 } });

  // Beats are SEQUENTIAL (each writes a snapshot that advances the counter) — one at a time, never Promise.all.
  expect(await driveReconcileBeat(h, chatId, 1)).toBe(false);
  expect(await driveReconcileBeat(h, chatId, 2)).toBe(false);
  expect(await driveReconcileBeat(h, chatId, 3)).toBe(false);
  expect(await driveReconcileBeat(h, chatId, 4)).toBe(false);
});

test("reconcile cadence: cheap mode honors it too (the TOOL ROUND receives reconcile on the Nth beat)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta: { statePatch: { location: "somewhere" }, journal: [] } });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "cheap", patch: { reconcileEveryBeats: 2 } });

  const { messageId: m1, variantId: v1 } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, m1, v1, castId<ChatTurnId>("chat_turn_cheap_1"), turnConnection());
  const { messageId: m2, variantId: v2 } = await seedMessage(db, chatId, 2, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, m2, v2, castId<ChatTurnId>("chat_turn_cheap_2"), turnConnection());

  // The tool round carried the cadence: beat 1 incremental, beat 2 reconcile — and nothing was folded.
  expect(h.fakes.toolRoundCalls.map((c) => c.reconcile)).toEqual([false, true]);
  expect(h.fakes.foldCalls).toHaveLength(0);
});

// ── R1: the FOLDED delivery fork ──────────────────────────────────────────────────────────────────
// `folded` deletes the post-commit round rather than moving it: the character turn already emitted the state,
// so the flush folds THOSE calls and pays no second model call. The fork's whole risk surface is the fallback
// arm — a folded turn whose connection could not carry the tools must still land its state (via cheap's round)
// and must SAY SO. Every case below asserts the call counts on the fakes, because "no second model call" is
// the entire point and a passing state assertion alone would not prove it.

/** The calls a folded character turn co-emitted (the shape the engine hands the flush off the completion). */
const FOLDED_CALLS = [{ toolCallId: "c1", name: "update_scene", arguments: '{"location":"the ford"}' }];

test("R1 folded: the turn's OWN tool calls are folded — ZERO post-commit model calls, path logged", async () => {
  const db = await freshDb();
  const foldedDelta = { statePatch: { location: "the ford" }, journal: [] };
  const { chatId, gameId, h } = await seedLiteGame(db, { foldedDelta });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  h.fakes.busEvents.length = 0;

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection({ terminalToolCalls: FOLDED_CALLS }));

  // The fold ran with the turn's own calls — and NO dedicated round fired. That pair of assertions IS R1.
  expect(h.fakes.foldCalls).toEqual([{ chatId, variantId, reconcile: false, toolCalls: FOLDED_CALLS }]);
  expect(h.fakes.toolRoundCalls).toHaveLength(0);
  // The delta landed through the SAME staging → flush tail as any round's.
  const snap = await findSnapshotByVariant(db, variantId);
  expect(snap?.location).toBe("the ford");
  expect(snap?.gameId).toBe(gameId);
  // A FOLDED turn emits TWO events. The snapshot lands FIRST and the tool-call record after it: part of a
  // call's verdict — what a hand lock suppressed — does not exist until the write + fold have run (#77), so
  // the row is written once, complete, rather than announced as `applied` and corrected. The record is still
  // unconditional (a turn whose calls all dropped writes no snapshot and still announces one — the two events
  // are independent, and the disclosure refetches on its own).
  expect(h.fakes.busEvents).toEqual([
    { type: "stateRoundStarted", chatId, turnId: TURN },
    { type: "snapshotPatched", chatId, snapshotId: snap?.id },
    { type: "turnToolCallsRecorded", chatId },
    { type: "stateRoundSettled", chatId, turnId: TURN },
  ]);
  // The resolution is named, with no fallback (the knob got what it asked for).
  expect(h.fakes.stateRoundPaths).toEqual([{ chatId, mode: "folded", path: "folded", fallbackReason: null }]);
});

test("R1 folded FALLBACK: zero terminal calls reruns the required tool round", async () => {
  const db = await freshDb();
  const toolRoundDelta = { statePatch: { location: "the kitchen table" }, journal: [] };
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  h.fakes.busEvents.length = 0;

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection({ terminalToolCalls: [] }));

  expect(h.fakes.foldCalls).toHaveLength(0);
  expect(h.fakes.toolRoundCalls).toEqual([{ chatId, messageId, variantId, reconcile: false }]);
  expect(h.fakes.stateRoundPaths).toEqual([{ chatId, mode: "folded", path: "tool-round", fallbackReason: "no-terminal-calls" }]);
  expect((await findSnapshotByVariant(db, variantId))?.location).toBe("the kitchen table");
});

test("R1 folded: explicit no_changes is a clean no-change beat — no round and no snapshot", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  const noChanges = [{ toolCallId: "quiet", name: "no_changes", arguments: "{}" }];
  h.fakes.busEvents.length = 0;

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection({ terminalToolCalls: noChanges }));

  expect(h.fakes.foldCalls[0]?.toolCalls).toEqual(noChanges);
  expect(h.fakes.toolRoundCalls).toHaveLength(0);
  expect(h.fakes.stateRoundPaths).toEqual([{ chatId, mode: "folded", path: "folded", fallbackReason: null }]);
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  expect(h.fakes.busEvents).toEqual([
    { type: "stateRoundStarted", chatId, turnId: TURN },
    { type: "turnToolCallsRecorded", chatId },
    { type: "stateRoundSettled", chatId, turnId: TURN },
  ]);
});

test("R1 folded FALLBACK: a null terminal channel runs cheap's tool round and NAMES the fallback", async () => {
  const db = await freshDb();
  const toolRoundDelta = { statePatch: { location: "the ford" }, journal: [] };
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  // `null` = the character turn could not mount the tools. The canonical case: the STATEFUL agent-sdk wire,
  // whose real capability co-emits fine — it simply has no terminal channel — so the reason must stay
  // `no-terminal-channel` and never inherit the local engine's guard vocabulary.
  const agentSdk = turnConnection({
    connection: makeResolvedConnection({
      api: "agent-sdk",
      capability: resolveModelCapability("claude-sonnet-5", "max-pro-sub", "agent-sdk"),
    }),
    terminalToolCalls: null,
  });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, agentSdk);

  // State still lands — the fold degrades to the SAME tool vehicle one beat later, never to nothing.
  expect(h.fakes.foldCalls).toHaveLength(0);
  expect(h.fakes.toolRoundCalls).toEqual([{ chatId, messageId, variantId, reconcile: false }]);
  expect((await findSnapshotByVariant(db, variantId))?.location).toBe("the ford");
  // …and the extra call the fold was supposed to delete is VISIBLE in the trail.
  expect(h.fakes.stateRoundPaths).toEqual([{ chatId, mode: "folded", path: "tool-round", fallbackReason: "no-terminal-channel" }]);
});

test("#1617 a WITHHELD channel (a collided terminal declaration) is its OWN named reason, not the wire's fault", async () => {
  const db = await freshDb();
  const toolRoundDelta = { statePatch: { location: "the ford" }, journal: [] };
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  // The channel is `null` for a reason that has nothing to do with the model: a contributor re-spelled a
  // registry tool's name, so the pipeline withheld the whole terminal mount for this turn. The wire here
  // CO-EMITS fine (the default capability), which is exactly the arm that used to report
  // `no-terminal-channel` — sending a reader to look at the connection instead of at the tool that collided.
  const collided = turnConnection({ terminalToolCalls: null, terminalToolsCollided: ["update_scene"] });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, collided);

  // State still lands, on the same vehicle every other fallback uses.
  expect(h.fakes.foldCalls).toHaveLength(0);
  expect(h.fakes.toolRoundCalls).toEqual([{ chatId, messageId, variantId, reconcile: false }]);
  expect((await findSnapshotByVariant(db, variantId))?.location).toBe("the ford");
  expect(h.fakes.stateRoundPaths).toEqual([{ chatId, mode: "folded", path: "tool-round", fallbackReason: "terminal-declaration-collided" }]);
});

test("#1604 a folded turn whose channel carries SEVERAL depths' calls folds them all, in order", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  // Since #1404 the pipeline accumulates the terminal half ACROSS recursion depths, so a folded game that
  // also attaches registry tools can hand this fold two depths' calls. The fold needs no depth-awareness:
  // it takes the array exactly as it takes one completion's parallel calls, and emission order is what makes
  // the single-valued `scene` plane land on the LATER depth's view (it saw the earlier depth's results).
  const multiDepth = [
    { toolCallId: "d0", name: "update_scene", arguments: '{"location":"the kitchen table"}' },
    { toolCallId: "d1", name: "update_scene", arguments: '{"location":"the ford"}' },
  ];

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection({ terminalToolCalls: multiDepth }));

  // Every depth's call reaches the fold, in the order the model emitted them — nothing is dropped for having
  // been emitted at depth 0, and nothing is re-ordered.
  expect(h.fakes.foldCalls[0]?.toolCalls).toEqual(multiDepth);
  expect(h.fakes.toolRoundCalls).toHaveLength(0);
  expect(h.fakes.stateRoundPaths).toEqual([{ chatId, mode: "folded", path: "folded", fallbackReason: null }]);
});

test("D112 fold guard: a folded game on the LOCAL engine rounds instead — named `local-engine-fold-guard`", async () => {
  const db = await freshDb();
  const toolRoundDelta = { statePatch: { location: "the ford" }, journal: [] };
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta, foldGuarded: true });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  // The REAL local-engine capability (the resolver's own vllm arm), so the reason is read off the wire the turn
  // actually ran on — not off a synthetic literal that could drift from what the connection domain declares.
  const local = turnConnection({
    connection: makeResolvedConnection({ capability: resolveModelCapability("Qwen/Qwen3-VL-8B-Instruct", "vllm", "chat-completions") }),
    terminalToolCalls: null, // the gather withheld the mount; the engine attached nothing
  });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, local);

  // State STILL lands — the SAME cheap post-commit round the no-terminal-channel arm runs (one home).
  expect(h.fakes.foldCalls).toHaveLength(0);
  expect(h.fakes.toolRoundCalls).toEqual([{ chatId, messageId, variantId, reconcile: false }]);
  expect((await findSnapshotByVariant(db, variantId))?.location).toBe("the ford");
  // …and the WARN names THIS cause, distinctly from a wire that simply has no terminal channel.
  expect(h.fakes.stateRoundPaths).toEqual([{ chatId, mode: "folded", path: "tool-round", fallbackReason: "local-engine-fold-guard" }]);
});

test("R1 folded: the readonly gate still wins — a tools-incapable connection fires NOTHING", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { foldedDelta: { statePatch: { location: "nope" }, journal: [] } });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  // Structured-only capability: folded has no write path ⇒ manual-steering (honest arms), so even a populated
  // terminal channel is not folded — the game is READ-ONLY and the host hand-edits.
  const readonly = turnConnection({
    connection: makeResolvedConnection({ capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true } }) }),
    terminalToolCalls: FOLDED_CALLS,
  });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, readonly);

  expect(h.fakes.foldCalls).toHaveLength(0);
  expect(h.fakes.toolRoundCalls).toHaveLength(0);
  expect(h.fakes.stateRoundPaths).toHaveLength(0); // gated BEFORE the fork — nothing resolved
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
});

test("R1 regression pin: CHEAP IGNORES a populated terminal channel (the host's opt-out arm is unchanged)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, {
    toolRoundDelta: { statePatch: { location: "round-wrote-this" }, journal: [] },
    foldedDelta: { statePatch: { location: "fold-wrote-this" }, journal: [] },
  });
  const withCalls = turnConnection({ terminalToolCalls: FOLDED_CALLS });

  // cheap (the host's opt-out from the born fold) — the dedicated round runs; the terminal channel is not its
  // business, even when the character turn co-emitted one.
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, castId<ChatTurnId>("chat_turn_pin_1"), withCalls);
  expect(h.fakes.toolRoundCalls).toHaveLength(1);
  expect(h.fakes.foldCalls).toHaveLength(0);
  expect((await findSnapshotByVariant(db, variantId))?.location).toBe("round-wrote-this");

  // The flush named its own vehicle, with no fallback (nothing was downgraded — cheap never folds by design).
  expect(h.fakes.stateRoundPaths).toEqual([{ chatId, mode: "cheap", path: "tool-round", fallbackReason: null }]);
});

test("R1 folded: the reconcile cadence still fires on the Nth beat (the fold carries it, not a round)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { foldedDelta: { statePatch: { location: "somewhere" }, journal: [] } });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded", patch: { reconcileEveryBeats: 2 } });

  const withCalls = turnConnection({ terminalToolCalls: FOLDED_CALLS });
  const { messageId: m1, variantId: v1 } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, m1, v1, castId<ChatTurnId>("chat_turn_fold_rc_1"), withCalls);
  const { messageId: m2, variantId: v2 } = await seedMessage(db, chatId, 2, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, m2, v2, castId<ChatTurnId>("chat_turn_fold_rc_2"), withCalls);

  expect(h.fakes.foldCalls.map((c) => c.reconcile)).toEqual([false, true]);
});

test("R1: a turn whose fold-mount failed lands its state via the fallback round (the degrade is end-to-end)", async () => {
  const db = await freshDb();
  // The gather's mount threw ⇒ no terminal tools rode ⇒ the engine hands the flush a `null` channel. The state
  // must still be captured — a failed MOUNT costs a call, never a beat.
  const toolRoundDelta = { statePatch: { location: "the ford" }, journal: [] };
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta, foldedToolsThrow: true });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false }); // the mount throws + is swallowed here
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection({ terminalToolCalls: null }));

  expect(h.fakes.foldBuildFailures).toHaveLength(1);
  expect((await findSnapshotByVariant(db, variantId))?.location).toBe("the ford");
  expect(h.fakes.stateRoundPaths).toEqual([{ chatId, mode: "folded", path: "tool-round", fallbackReason: "no-terminal-channel" }]);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE LOCK TRAIL (#77) — a hand LOCK that suppresses a turn's write is named on the durable record.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// A hand edit auto-locks what it touched and a later tool write at that path is dropped by `applyLockedPatch`
// (manual-edit-wins — the lock BEHAVIOR is not under test here and does not change). What the record used to
// say about that turn was `verdict: "applied", issues: []` — the durable inspector claiming a write landed
// that no state carries, which is the one thing it exists not to do.
//
// TWO SUPPRESSION SITES, and each gets a case, because they are collected by different code and either could
// rot silently: the ACCUMULATOR (`staging.ts` — the base snapshot already carried the lock when the turn
// staged; the live-dogfood shape) and the FOLD (`snapshot-edit.ts` — a hand row landed MID-FLIGHT and the
// replay is arbitrated by ITS locks).

/** The recorded calls the durable per-variant row holds (the shape the disclosure renders). */
async function recordedCalls(db: Awaited<ReturnType<typeof freshDb>>, variantId: MessageVariantId): Promise<readonly RpgRecordedToolCall[]> {
  const rows = await findTurnToolCallsByVariant(db, variantId);
  return rows[0]?.calls ?? [];
}

test("LOCK TRAIL (accumulator): a hand-locked plane suppresses this turn's write — the record NAMES it, never `applied`", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { foldedDelta: { statePatch: { location: "the ford" }, journal: [] } });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });

  // Beat 1: an ordinary turn, then the host hand-edits the location — which AUTO-LOCKS it. This is the live
  // shape: the lock is stamped in an EARLIER beat, so the next turn's write base already carries it.
  const first = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, first.messageId, first.variantId, castId<ChatTurnId>("chat_turn_lock_1"), turnConnection({ terminalToolCalls: [] }));
  expect(await h.service.editSnapshot({ principal: principal(castId<Handle>("host")), chatId, patch: { location: "the guard post" } })).toEqual({ ok: true });

  // Beat 2: the model writes the very plane the host pinned.
  const { messageId, variantId } = await seedMessage(db, chatId, 2, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection({ terminalToolCalls: FOLDED_CALLS }));

  // The lock still WINS (manual-edit-wins is unchanged — #78 owns the granularity question).
  const view = await h.service.getTrackerView({ principal: principal(castId<Handle>("host")), chatId });
  expect(view.ambient?.location).toBe("the guard post");
  // …and the durable record no longer claims the write landed.
  const calls = await recordedCalls(db, variantId);
  expect(calls).toHaveLength(1);
  expect(calls[0]?.name).toBe("update_scene");
  expect(calls[0]?.verdict).not.toBe("applied");
  expect(calls[0]?.issues.join(" · ")).toContain("location");
});

test("LOCK TRAIL: an unlocked turn is byte-identical — verdict `applied`, issues empty", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { foldedDelta: { statePatch: { location: "the ford" }, journal: [] } });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection({ terminalToolCalls: FOLDED_CALLS }));

  expect((await findSnapshotByVariant(db, variantId))?.location).toBe("the ford");
  expect(await recordedCalls(db, variantId)).toEqual([{ name: "update_scene", args: '{"location":"the ford"}', verdict: "applied", issues: [] }]);
});

test("the record survives a REFUSED write — the turn a user most needs to see is still disclosed", async () => {
  const db = await freshDb();
  // The record moved AFTER the write boundary so a lock suppression can reach it (#77), and this pins the
  // invariant that move must not cost: a flush the write boundary REFUSES still records what the model called.
  // That turn — output produced, nothing landed — is exactly the one the disclosure exists for.
  const { chatId, h } = await seedLiteGame(db, { foldedDelta: { statePatch: { location: "the ford" }, journal: [] } });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  h.ctx.staging.ensure(TURN, {
    ...defaultSnapshotState(),
    actorState: [
      {
        actorRef: { kind: "npc", npcKey: "broken" },
        volatile: { trackerValues: { hp: { value: 1, items: null, max: 0 } }, conditions: [], inventory: [], wallet: [], status: "" },
      },
    ],
  });

  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection({ terminalToolCalls: FOLDED_CALLS }));

  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined(); // the write was refused (canon uncorrupted)
  expect(h.fakes.flushDrops).toHaveLength(1);
  expect(await recordedCalls(db, variantId)).toEqual([{ name: "update_scene", args: '{"location":"the ford"}', verdict: "applied", issues: [] }]);
});

test("LOCK TRAIL: a `no_changes` call is never marked — it authored nothing to suppress", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { foldedDelta: { statePatch: { location: "the ford" }, journal: [] } });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  const first = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, first.messageId, first.variantId, castId<ChatTurnId>("chat_turn_quiet_1"), turnConnection({ terminalToolCalls: [] }));
  await h.service.editSnapshot({ principal: principal(castId<Handle>("host")), chatId, patch: { location: "the guard post" } });

  const { messageId, variantId } = await seedMessage(db, chatId, 2, { role: "assistant" });
  const mixed = [...FOLDED_CALLS, { toolCallId: "quiet", name: "no_changes", arguments: "{}" }];
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection({ terminalToolCalls: mixed }));

  const calls = await recordedCalls(db, variantId);
  // The writing call carries the trail; the quiet one is left exactly as the schema projection made it.
  expect(calls[0]?.verdict).not.toBe("applied");
  expect(calls[1]).toEqual({ name: "no_changes", args: "{}", verdict: "applied", issues: [] });
});

test("LOCK TRAIL (fold): a hand edit landing MID-FLIGHT suppresses the replay — the record names that too", async () => {
  const db = await freshDb();
  // The cheap round's delta carries its own recorded calls (the vehicle that HAS them), and the round is held
  // in flight so the host's edit lands after the write base was read: the accumulator sees no lock at all, and
  // the suppression happens only when the fold replays onto the hand head. That is the second collector.
  const toolRoundDelta = {
    statePatch: { location: "the ford" },
    journal: [],
    recordedToolCalls: [{ name: "update_scene", args: '{"location":"the ford"}', verdict: "applied" as const, issues: [] }],
  };
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls);
  // The host edits the panel WHILE the round runs — a hand row at this same beat, auto-locking `location`.
  expect(await h.service.editSnapshot({ principal: principal(castId<Handle>("host")), chatId, patch: { location: "the guard post" } })).toEqual({ ok: true });
  releaseRound();
  await flush;

  // The fold ran and the human kept their field.
  const view = await h.service.getTrackerView({ principal: principal(castId<Handle>("host")), chatId });
  expect(view.ambient?.location).toBe("the guard post");
  const calls = await recordedCalls(db, variantId);
  expect(calls[0]?.verdict).not.toBe("applied");
  expect(calls[0]?.issues.join(" · ")).toContain("location");
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// #78 — THE PACK'S PIN IS ITEM-GRANULAR, AT BOTH SUPPRESSION SITES
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// A hand add used to pin the whole `…volatile.inventory` plane, so one manual item permanently fenced the model
// out of the entire pack (measured live: a PERFECT model update — the `location` of the very item the host had
// added — folded away, and the record said `applied`). The pin is now per-item, per-claimed-field, which means
// BOTH of these must hold in one turn: the model's write to an UNCLAIMED field of the pinned item lands, its
// write to a CLAIMED one is dropped AND named on the record, and an item the model ADDS is never blocked.
// Both collectors get a case (the accumulator and the fold), per the two-sites rule that #77 minted.

const HOST_P = principal(castId<Handle>("host"));
const MIRA = { kind: "npc", npcKey: "mira" } as const;

/** The pack the projection carries for `npc:mira` (the panel's own read). */
async function miraPack(
  h: Awaited<ReturnType<typeof seedLiteGame>>["h"],
  chatId: ChatId,
): Promise<readonly { readonly id: string; readonly name: string; readonly location: string }[]> {
  const view = await h.service.getTrackerView({ principal: HOST_P, chatId });
  const mira = view.actors.find((a) => a.actorRef.kind === "npc" && a.actorRef.npcKey === "mira");
  return mira?.volatile?.inventory ?? [];
}

/** A whole-pack model patch for mira, the way the appliers compose one (the plane authored entire). */
function packPatch(items: readonly Record<string, unknown>[]): Record<string, unknown> {
  return { actorState: [{ actorRef: MIRA, volatile: { inventory: items } }] };
}

/** A complete inventory element (the F1 write boundary parses the merged state, so a NEW element is total). */
function item(id: string, name: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, name, description: "", quantity: 1, location: "", type: "", ...over };
}

test("#78 (accumulator): a hand-added item pins its CLAIMED fields only — the story still writes its location and adds items", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { foldedDelta: { statePatch: {}, journal: [] } });
  await h.service.updateConfig({ principal: HOST_P, chatId, extractionMode: "folded" });

  // Beat 1: the host seeds the pack by hand — the gesture that used to disable inventory tracking for good.
  const first = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, first.messageId, first.variantId, castId<ChatTurnId>("chat_turn_pack_1"), turnConnection({ terminalToolCalls: [] }));
  expect(await h.service.patchActor({ principal: HOST_P, chatId, targetRef: MIRA, ops: [{ op: "addItem", item: { name: "Bone key" } }] })).toEqual({
    ok: true,
  });
  const [seeded] = await miraPack(h, chatId);
  const keyId = seeded?.id ?? "";

  // Beat 2: the story renames that item (a CLAIMED field), gives it a location (unclaimed) and adds one of
  // its own — the whole plane, composed from the base, exactly as `applyInventoryPatch` authors it.
  h.fakes.foldedDelta = {
    statePatch: packPatch([item(keyId, "a rusted key", { location: "belt pouch" }), item("item_story_rope", "Rope", { quantity: 2 })]),
    journal: [],
  };
  const { messageId, variantId } = await seedMessage(db, chatId, 2, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection({ terminalToolCalls: FOLDED_CALLS }));

  const pack = await miraPack(h, chatId);
  const key = pack.find((it) => it.id === keyId);
  expect(key?.name).toBe("Bone key"); // the hand's claim held
  expect(key?.location).toBe("belt pouch"); // …and the story still wrote the field the hand never claimed
  expect(pack.map((it) => it.name).sort()).toEqual(["Bone key", "Rope"]); // …and its own item landed
  // The record names the ONE path the pin ate — at the item, not at the plane.
  const calls = await recordedCalls(db, variantId);
  expect(calls[0]?.verdict).not.toBe("applied");
  expect(calls[0]?.issues.join(" · ")).toContain(`inventory.${keyId}.name`);
});

test("#78 (fold): a hand item edit landing MID-FLIGHT pins that field alone — the round's other pack writes survive", async () => {
  const db = await freshDb();
  const toolRoundDelta = {
    statePatch: {},
    journal: [],
    recordedToolCalls: [{ name: "update_inventory", args: "{}", verdict: "applied" as const, issues: [] }],
  };
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta });
  await pinExtractionMode(h, chatId, "cheap");

  // The story's own item, present before the turn — `autoLock:false` so the hand seeding it pins nothing.
  await h.service.patchActor({ principal: HOST_P, chatId, targetRef: MIRA, ops: [{ op: "addItem", item: { name: "Bone key" } }], autoLock: false });
  const keyId = (await miraPack(h, chatId))[0]?.id ?? "";
  h.fakes.toolRoundDelta = {
    ...toolRoundDelta,
    statePatch: packPatch([item(keyId, "a rusted key", { location: "belt pouch" }), item("item_story_rope", "Rope")]),
  };

  const { messageId, variantId } = await seedMessage(db, chatId, 2000, { role: "assistant" });
  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls);
  // The host renames the item WHILE the round runs — a hand row at this beat, pinning that ONE field.
  expect(
    await h.service.patchActor({ principal: HOST_P, chatId, targetRef: MIRA, ops: [{ op: "patchItem", id: keyId, patch: { name: "Bone key" } }] }),
  ).toEqual({ ok: true });
  releaseRound();
  await flush;

  const pack = await miraPack(h, chatId);
  expect(pack.find((it) => it.id === keyId)?.name).toBe("Bone key"); // the human's field
  expect(pack.find((it) => it.id === keyId)?.location).toBe("belt pouch"); // the round's, on the same item
  expect(pack.map((it) => it.name).sort()).toEqual(["Bone key", "Rope"]);
  const calls = await recordedCalls(db, variantId);
  expect(calls[0]?.verdict).not.toBe("applied");
  expect(calls[0]?.issues.join(" · ")).toContain(`inventory.${keyId}.name`);
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// CANCELLATION (RPG-SIGNAL) — the state round is abortable, and an aborted round WRITES NOTHING.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// Why the cancel comes through rpg's OWN barrier and not the character turn's AbortSignal: the round is fired
// fire-and-forget from inside the turn body AFTER `commitGeneration`, and `runRegistered`'s `finally` calls
// `handle.release()` microseconds later — which DELETES the entry from `activeTurns`, so from that instant
// `activeTurns.abort` walks a set the turn has left and signals nobody, while the round runs its 0.8-2.9s model
// call. `cancelStateRounds` is the door that reaches it (full timeline: `ChatRpgOps.cancelStateRounds`).
//
// THE RULING these pin: a cancelled round is BYTE-IDENTICAL TO A NON-WRITING TURN — it refuses to write and
// discards its staging; it never rolls back a write that already landed.

const HOST_USER = castId<UserId>("user_host");

/** Park until the state round has actually STARTED (it records its call before awaiting `stateRoundGate`). A
 *  fixed number of microtask ticks would be a guess — the flush does several db awaits first — and the guess
 *  passes or fails by machine speed. Barriering on the settled fact is what makes the cancel land MID-round. */
function untilRoundStarted(calls: readonly unknown[]): Promise<void> {
  const poll = (attemptsLeft: number): Promise<void> => {
    if (calls.length > 0) {
      return Promise.resolve();
    }
    if (attemptsLeft === 0) {
      return Promise.reject(new Error("the state round never started — the cancel would not have been mid-round"));
    }
    return new Promise((resolve) => setTimeout(resolve, 5)).then(() => poll(attemptsLeft - 1));
  };
  return poll(400);
}

test("MID-ROUND cancel: the running round's own signal fires and the flush writes NOTHING", async () => {
  const db = await freshDb();
  // The round WOULD have written all three planes — so their absence is the cancel's doing, never an empty delta.
  const toolRoundDelta = {
    statePatch: { location: "the drowned chapel" },
    journal: [{ type: "note", label: "", title: "A beat", content: "It happened." }],
  };
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  h.fakes.busEvents.length = 0;

  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls); // the round is suspended with its model call outstanding

  // THE ABORT — through the exact op the chat `abort` verb calls.
  expect(h.chatOps.cancelStateRounds(chatId, HOST_USER)).toBe(1);
  releaseRound();
  await flush;

  // 1. the cancellation REACHED THE VEHICLE — the real arms hand this same signal to the provider request, so
  //    this is the difference between "cancelled the call" and "ignored the delta afterwards".
  expect(h.fakes.stateRoundSignalAborted).toEqual([true]);
  // 2. THE DURABLE OBSERVABLE: no snapshot, no journal, no bus emit — byte-identical to a non-writing turn,
  //    even though the round handed back a delta that would have written all three.
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  expect(await listJournalByVariant(db, variantId)).toEqual([]);
  expect(h.fakes.busEvents).toEqual([
    { type: "stateRoundStarted", chatId, turnId: TURN },
    { type: "stateRoundSettled", chatId, turnId: TURN },
  ]);
  // 3. and the discard is VISIBLE — a correct cancel that vanished silently would be the same blind spot the
  //    `onFlushDropped` backstop exists to close. `discardedStagedWrites` says a finished extraction was thrown
  //    away (the expensive case), and it is NOT filed as a contract-invalid drop: a cancel is not a corruption.
  expect(h.fakes.stateRoundCancels).toEqual([{ chatId, turnId: TURN, discardedStagedWrites: true }]);
  expect(h.fakes.flushDrops).toEqual([]);
  // 3b. …and the round SETTLES on the cancel arm too (#1493 residual): the settle used to live past both
  //     cancel returns, so a caller who pressed Stop left every reader waiting for an event that never came.
  expect(h.fakes.flushSettles).toHaveLength(1);
  expect(h.fakes.flushSettles[0]).toMatchObject({ chatId, turnId: TURN, outcome: "cancelled", droppedReason: null });
});

test("cancel is OWNER-SCOPED: another member's Stop leaves this round alone and the state still lands", async () => {
  const db = await freshDb();
  // The rollback-theft defense carried onto the state plane: `activeTurns.abort` is deliberately owner-only, so a
  // blanket per-chat cancel here would let member B silently kill member A's in-flight round.
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta: { statePatch: { location: "the ford" }, journal: [] } });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls);

  expect(h.chatOps.cancelStateRounds(chatId, castId<UserId>("user_member"))).toBe(0); // not theirs to cancel
  releaseRound();
  await flush;

  expect(h.fakes.stateRoundSignalAborted).toEqual([false]);
  expect((await findSnapshotByVariant(db, variantId))?.location).toBe("the ford");
  expect(h.fakes.stateRoundCancels).toEqual([]);
});

test("cancelled BEFORE the round starts: NO model call at all (nothing billed for an abandoned turn)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta: { statePatch: { location: "never written" }, journal: [] } });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  // The character turn's own signal is ALREADY aborted when the flush registers — the queued-behind-a-Stop case
  // (a later speaker in a group round, where the shared registration IS still live). No read, no call, no write.
  const turn = new AbortController();
  turn.abort();
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection({ signal: turn.signal }));

  expect(h.fakes.toolRoundCalls).toEqual([]); // the vehicle never fired — zero spend
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  expect(h.fakes.stateRoundCancels).toEqual([{ chatId, turnId: TURN, discardedStagedWrites: false }]);
});

test("a cancelled round still holds the FLUSH BARRIER until it unwinds (the stale-read race stays closed)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta: { statePatch: { location: "discarded" }, journal: [] } });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls);
  h.chatOps.cancelStateRounds(chatId, HOST_USER);

  // The next turn's gather must NOT proceed merely because the round was cancelled — it is still unwinding (and
  // clearing its staging). Dropping the entry at cancel time would re-open the race the barrier exists to close.
  let released = false;
  const wait = h.ctx.flushBarrier.awaitInFlight(chatId).then(() => {
    released = true;
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(released).toBe(false);

  releaseRound();
  await flush;
  await wait;
  expect(released).toBe(true);
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
});
