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
// the write boundary (canon uncorrupted). F2 — a party-member write (addressed by NAME) lands under the roster
// ref key, not an orphan `cast:<name>` the panel never reads. (The pure applier F1-mint / F2-resolve units live
// in `tools/apply.test.ts`.)

import type { ChatId, ChatTurnId, Handle, RpgQuestId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { resolveModelCapability } from "../../../../../packages/server/src/domain/connection/catalog/resolve-model-capability.ts";
import type { RpgRosterActor } from "../../../../../packages/server/src/domain/rpg/index.ts";
import { rpgToolDefinitions } from "../../../../../packages/server/src/domain/rpg/index.ts";
import { listJournalByVariant } from "../../../../../packages/server/src/domain/rpg/persistence/journal.ts";
import { findSnapshotByVariant } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { defaultSnapshotState } from "../../../../../packages/server/src/domain/rpg/substrate/default-state.ts";
import { buildRosterRefIndex, extractionToStateDelta } from "../../../../../packages/server/src/domain/rpg/tools/apply.ts";
import type { ToolExecutionContext } from "../../../../../packages/server/src/domain/tool-use/index.ts";
import { freshDb } from "../../../../support/db.ts";
import { makeModelCapability, makeResolvedConnection } from "../../../../support/factories/resolved-connection.ts";
import { expect, pinExtractionMode, principal, seedLiteGame, seedMessage, test, turnConnection } from "../_support.ts";

const TURN: ChatTurnId = castId<ChatTurnId>("chat_turn_t1");
const POOLS_MAX_RE = /pools|max/i;

function exec(chatId: ChatId, turnId: ChatTurnId): ToolExecutionContext {
  return { principal: principal(castId<Handle>("host")), triggeredBy: castId("user_host"), chatId, turnId, roster: null };
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
  // §4.9: the flush emitted `snapshotPatched` (no journal ⇒ no `journalChanged`).
  expect(h.fakes.busEvents).toEqual([{ type: "snapshotPatched", chatId, snapshotId: snap?.id }]);
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
    { type: "snapshotPatched", chatId, snapshotId: snap?.id },
    { type: "journalChanged", chatId },
  ]);
});

test("a turn that staged nothing writes NO snapshot (byte-identical non-writing turn)", async () => {
  const db = await freshDb();
  // Empty round delta (the default) → nothing to write.
  const { chatId, h } = await seedLiteGame(db);
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  h.fakes.busEvents.length = 0; // drop the createGame emit — a non-writing flush must add nothing

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  // A non-writing turn emits nothing (no snapshot, no journal).
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
  const wizard = snap?.actorState?.find((a) => a.actorRef.kind === "cast" && a.actorRef.castKey === "wizard");
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
        actorRef: { kind: "cast", castKey: "broken" },
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
});

test("ROUND-TRIP (the exec's replayed output): extraction JSON → delta → flush → getTrackerView reads it back", async () => {
  const db = await freshDb();
  // The EXACT captured extraction the exec replayed (a schema-valid, enum-constrained, applicable delta
  // the F1 diagnosis said was silently dropped): a scene write + a party status on the player + a journal beat.
  // This pins the FULL round-trip lands (no silent write-boundary drop for a legitimate extraction).
  const player: RpgRosterActor = { actorRef: { kind: "user", userId: castId("user_host") }, name: "You" };
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
    buildRosterRefIndex([player]),
  );
  const { chatId, h } = await seedLiteGame(db, { roster: [player], toolRoundDelta });
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

test("F2: update_party on a ROSTER character surfaces under the roster key in getTrackerView", async () => {
  const db = await freshDb();
  // A roster character "Kael" — the gather reminder + tracker view key volatile by the roster ref. The id is a
  // REAL TypeID (the contract `characterId` belt validates it at flush; a malformed fake id would be refused).
  const kael: RpgRosterActor = { actorRef: { kind: "character", characterId: mintTypeId(ID_PREFIX.character) }, name: "Kael" };
  const { chatId, h } = await seedLiteGame(db, { roster: [kael] });

  // The model addresses the party member by NAME (it never sees ids).
  await rpgToolDefinitions(h.ctx)[0]?.handler({ targetRef: "Kael", trackerDeltas: [{ key: "focus", delta: 7 }] }, exec(chatId, TURN));
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  const view = await h.service.getTrackerView({ principal: principal(castId<Handle>("host")), chatId });
  const kaelView = view.actors.find((a) => a.actorRef.kind === "character");
  // The write SURFACES under the roster character's key — not an orphan cast:Kael the panel never reads.
  expect(kaelView?.name).toBe("Kael");
  expect(kaelView?.volatile?.trackerValues["focus"]).toEqual({ value: 7, items: null, max: null });
  // And there is NO orphan cast:Kael entry.
  expect(view.actors.some((a) => a.actorRef.kind === "cast" && a.actorRef.castKey === "Kael")).toBe(false);
});

test("F2: update_inventory on a ROSTER user surfaces its wallet under the roster key", async () => {
  const db = await freshDb();
  const player: RpgRosterActor = { actorRef: { kind: "user", userId: castId("user_host") }, name: "Player" };
  const { chatId, h } = await seedLiteGame(db, { roster: [player] });

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
  expect(h.fakes.busEvents).toEqual([{ type: "snapshotPatched", chatId, snapshotId: snap?.id }]);
  // The resolution is named, with no fallback (the knob got what it asked for).
  expect(h.fakes.stateRoundPaths).toEqual([{ chatId, mode: "folded", path: "folded", fallbackReason: null }]);
});

test("R1 folded: ZERO tool calls is a clean no-change beat — the fold runs, no round, no snapshot", async () => {
  const db = await freshDb();
  // The fold fake returns the empty delta (what the real op returns on a quiet beat).
  const { chatId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  h.fakes.busEvents.length = 0;

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection({ terminalToolCalls: [] }));

  // An EMPTY array is NOT a fallback: the fold ran (with nothing), so no post-commit call is paid to re-ask.
  expect(h.fakes.foldCalls).toHaveLength(1);
  expect(h.fakes.foldCalls[0]?.toolCalls).toEqual([]);
  expect(h.fakes.toolRoundCalls).toHaveLength(0);
  expect(h.fakes.stateRoundPaths[0]?.path).toBe("folded");
  // Nothing staged ⇒ the byte-identical non-writing turn (no redundant clone-forward snapshot, no emit).
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  expect(h.fakes.busEvents).toEqual([]);
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
