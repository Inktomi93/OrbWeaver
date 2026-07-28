// tests/server/domain/rpg/chat-ops/flush — the turn-completion FLUSH + the delivery-mode branch (rpg-design/05
// §2.4-2.5 + §4.6). Both modes funnel through the accumulator: cheap = the mid-turn staged writes are taken +
// written; reliable = the injected `runExtraction` op stages its delta first, THEN take + write. Journal entries
// stamp the committed `{variantId, sourceMessageId}`. A turn that staged nothing writes no snapshot.
//
// The flush READ-BACK regressions (stickler F1/F2) live here too — the flush IS the write→read seam, and the
// tools int suite only asserts `staging.peek()` (the accumulator), never a durable flush + a `getTrackerView`
// read-back (the gap that let two write↔read bugs ship). F1 — a negative pool delta on a fresh pool must NOT
// mint `max <= 0` (the contract belt `pools[].max >= 1`), and a contract-INVALID assembled state is DROPPED at
// the write boundary (canon uncorrupted). F2 — a party-member write (addressed by NAME) lands under the roster
// ref key, not an orphan `cast:<name>` the panel never reads. (The pure applier F1-mint / F2-resolve units live
// in `tools/apply.test.ts`.)

import type { ChatId, ChatTurnId, RpgQuestId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RpgRosterActor } from "../../../../../packages/server/src/domain/rpg/index";
import { rpgToolDefinitions } from "../../../../../packages/server/src/domain/rpg/index";
import { listJournalByVariant } from "../../../../../packages/server/src/domain/rpg/persistence/journal";
import { findSnapshotByVariant } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots";
import { defaultSnapshotState } from "../../../../../packages/server/src/domain/rpg/substrate/default-state";
import { buildRosterRefIndex, extractionToStateDelta } from "../../../../../packages/server/src/domain/rpg/tools/apply";
import type { ToolExecutionContext } from "../../../../../packages/server/src/domain/tool-use";
import { freshDb } from "../../../../support/db";
import { makeModelCapability, makeResolvedConnection } from "../../../../support/factories/resolved-connection";
import { expect, principal, seedLiteGame, seedMessage, test, turnConnection } from "../_support";

const TURN: ChatTurnId = castId<ChatTurnId>("chat_turn_t1");
const POOLS_MAX_RE = /pools|max/i;

function exec(chatId: ChatId, turnId: ChatTurnId): ToolExecutionContext {
  return { principal: principal("host"), triggeredBy: castId("user_host"), chatId, turnId, roster: null };
}

test("cheap mode: the dedicated TOOL ROUND is called, its delta is staged + flushed (owner ruling 2026-07-27)", async () => {
  const db = await freshDb();
  // Cheap mode now runs a DEDICATED tool round post-commit (symmetric with reliable's extraction) — the
  // parallel tool calls fold to a delta the flush stages + writes, NOT mid-turn-staged tools on the char turn.
  const toolRoundDelta = { statePatch: { location: "the cave mouth" }, journal: [] };
  const { chatId, gameId, h } = await seedLiteGame(db, { toolRoundDelta });
  await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  h.fakes.busEvents.length = 0; // drop the createGame/updateConfig emits — assert the flush emit alone

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  // The tool-round op fired with the committed identifiers; the extraction op did NOT (the cheap arm).
  expect(h.fakes.toolRoundCalls).toEqual([{ chatId, messageId, variantId }]);
  expect(h.fakes.extractionCalls).toHaveLength(0);
  const snap = await findSnapshotByVariant(db, variantId);
  expect(snap?.location).toBe("the cave mouth");
  expect(snap?.committed).toBe(0); // born uncommitted — the next user send locks it in
  expect(snap?.gameId).toBe(gameId);
  // §4.9: the flush emitted `snapshotPatched` (no journal ⇒ no `journalChanged`).
  expect(h.fakes.busEvents).toEqual([{ type: "snapshotPatched", chatId, snapshotId: snap?.id }]);
});

test("F2 (readonly gate): a turn connection without the mode's writer capability fires NO round and writes nothing", async () => {
  const db = await freshDb();
  // Reliable mode needs `output.structured`. A turn connection whose capability LACKS it is readonly
  // (manual-steering) — the flush must skip the round (no `runExtraction` call, no per-turn failing spend) and
  // write no snapshot. The verdict reads THIS connection (F1 — never a re-resolve of the global default).
  const extractionDelta = { statePatch: { location: "unreachable" }, journal: [] };
  const { chatId, h } = await seedLiteGame(db, { extractionDelta }); // reliable by default
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  h.fakes.busEvents.length = 0;

  const readonlyConn = turnConnection({
    connection: makeResolvedConnection({ capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 } } }) }), // structured ABSENT
  });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, readonlyConn);

  expect(h.fakes.extractionCalls).toHaveLength(0); // the round was gated OUT before any model call
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  expect(h.fakes.busEvents).toEqual([]);
});

test("reliable mode: runExtraction is called, its delta is staged + flushed", async () => {
  const db = await freshDb();
  const extractionDelta = {
    statePatch: { location: "the obsidian tower" },
    journal: [{ type: "location", title: "Arrival", content: "They reached the tower." }],
  };
  const { chatId, h } = await seedLiteGame(db, { extractionDelta }); // seedLiteGame defaults to reliable
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  h.fakes.busEvents.length = 0; // drop the createGame emit — assert the flush emits alone

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  // The extraction op fired with the committed identifiers.
  expect(h.fakes.extractionCalls).toEqual([{ chatId, messageId, variantId }]);
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
  // Empty extraction delta (the default) + reliable mode → nothing to write.
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
  await rpgToolDefinitions(h.ctx)[0]?.handler({ targetRef: "Wizard", poolDeltas: [{ name: "mana", delta: -3 }] }, exec(chatId, TURN));

  // Flush the turn onto a committed assistant slot — this is where the poisoned row used to commit.
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  // The persisted row is CONTRACT-VALID (floored: value=0, max=1) — a `max <= 0` would have failed parse-on-read.
  const snap = await findSnapshotByVariant(db, variantId);
  const wizard = snap?.actorState?.find((a) => a.actorRef.kind === "cast" && a.actorRef.castKey === "Wizard");
  expect(wizard?.pools).toEqual([{ name: "mana", value: 0, max: 1 }]);
  // And the member tracker read no longer THROWS (the poison used to brick every later read forever).
  await expect(h.service.getTrackerView({ principal: principal("host"), chatId })).resolves.toBeDefined();
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
        actorRef: { kind: "cast", castKey: "Broken" },
        hp: null,
        pools: [{ name: "x", value: 0, max: 0 }],
        conditions: [],
        inventory: [],
        wallet: [],
        status: "",
      },
    ],
    widgetValues: {},
    quests: [],
    plot: null,
    fieldLocks: null,
  });
  h.ctx.staging.stageJournal(TURN, { type: "note", title: "beat", content: "c" });

  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  // The invalid state was REFUSED at the write boundary — NO snapshot committed (canon uncorrupted).
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  // The journal rode the same atomic drop — no orphan beat referencing a snapshot that never landed.
  const journal = await h.service.listJournal({ principal: principal("host"), chatId, limit: 50 });
  expect(journal).toEqual([]);
  // VISIBILITY (the fix): the drop was OBSERVED, never silent — the recorder captured it WITH the field-level
  // reason (a state round that produced applicable output vanishing without a signal was the exact violation).
  expect(h.fakes.flushDrops).toHaveLength(1);
  expect(h.fakes.flushDrops[0]?.variantId).toBe(variantId);
  expect(h.fakes.flushDrops[0]?.reason).toMatch(POOLS_MAX_RE);
});

test("reliable ROUND-TRIP (the exec's replayed output): extraction JSON → delta → flush → getTrackerView reads it back", async () => {
  const db = await freshDb();
  // The EXACT captured reliable extraction the exec replayed (a schema-valid, enum-constrained, applicable delta
  // the F1 diagnosis said was silently dropped): a scene write + a party status on the player + a journal beat.
  // This pins the FULL round-trip lands (no silent write-boundary drop for a legitimate extraction).
  const player: RpgRosterActor = { actorRef: { kind: "user", userId: castId("user_host") }, name: "You" };
  const extractionDelta = extractionToStateDelta(
    defaultSnapshotState(),
    {
      party: [{ targetRef: "player", status: "Bleeding (Critical)" }],
      inventory: [],
      scene: { location: "cave", weather: "nightfall" },
      widgets: [],
      quests: [],
      // TITLE-LESS journal entry (the blocker fix, ruling #10): the 8B drops the nested-required `title`; the
      // entry must still land, its title DERIVED from the content head. This is the exact 5/8-failure shape.
      journal: [{ type: "combat", content: "Wounded by the troll as it swung its club." }],
    },
    { item: () => "item_x", quest: () => castId<RpgQuestId>("q_x"), objective: () => "obj_x" },
    buildRosterRefIndex([player]),
  );
  const { chatId, h } = await seedLiteGame(db, { roster: [player], extractionDelta });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  // No silent drop — the flush COMMITTED (the whole point of the fix's root-cause half).
  expect(h.fakes.flushDrops).toEqual([]);
  // The panel READS BACK every plane the extraction wrote (the coordinator's bar: replayed output → tracker view).
  const view = await h.service.getTrackerView({ principal: principal("host"), chatId });
  expect(view.ambient?.location).toBe("cave");
  expect(view.ambient?.weather?.type).toBe("nightfall");
  const you = view.actors.find((a) => a.actorRef.kind === "user");
  expect(you?.volatile?.status).toBe("Bleeding (Critical)");
  // The title-less journal entry LANDED with a DERIVED title (the content head) — not dropped.
  const entries = await listJournalByVariant(db, variantId);
  expect(entries).toHaveLength(1);
  expect(entries[0]?.title).toBe("Wounded by the troll as it swung its club.");
});

test("FLUSH BARRIER: a fast re-send BLOCKS on the prior in-flight flush, then assembles off FRESH state (not stale)", async () => {
  const db = await freshDb();
  // Turn 1's extraction writes a beat + a location. The barrier must make turn 2's gather WAIT for that flush
  // before it reads state — otherwise turn 2 assembles its reminder off the STALE (pre-flush) empty state (the
  // exec's live-confirmed race: ex2 read beats:0 while ex1's flush was in flight, now that the state round is a
  // real 0.8-2.9s call).
  const extractionDelta = {
    statePatch: { location: "the sunken cathedral" },
    journal: [{ type: "location", title: "Descent", content: "They descended into the cathedral." }],
  };
  const { chatId, h } = await seedLiteGame(db, { extractionDelta });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  // HOLD turn 1's flush in-flight: the extraction gate blocks until we release it.
  let releaseFlush = (): void => undefined;
  h.fakes.extractionGate = new Promise<void>((resolve) => {
    releaseFlush = resolve;
  });

  // Turn 1 completes — register + await the flush, but it hangs on the gate. Fire-and-forget (as the engine does).
  const flush1 = h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  // Turn 2's gather starts while turn 1's flush is STILL in flight. It must block on the barrier.
  let gatherResolved = false;
  const gather2 = h.chatOps.gatherTurnContext(chatId, undefined, false).then((result) => {
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
  const extractionDelta = { statePatch: { location: "the drowned crypt" }, journal: [] };
  const { chatId, h } = await seedLiteGame(db, { extractionDelta });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  let releaseFlush = (): void => undefined;
  h.fakes.extractionGate = new Promise<void>((resolve) => {
    releaseFlush = resolve;
  });

  // NO await between these two — the immediate-resend timing. `register` must have already run (synchronously,
  // before onTurnCompleted's first await) so the gather kicked off on the very next line sees the entry.
  const flush1 = h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());
  let gatherResolved = false;
  const gather2 = h.chatOps.gatherTurnContext(chatId, undefined, false).then((r) => {
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
  await rpgToolDefinitions(h.ctx)[0]?.handler({ targetRef: "Kael", poolDeltas: [{ name: "focus", delta: 7 }] }, exec(chatId, TURN));
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, turnConnection());

  const view = await h.service.getTrackerView({ principal: principal("host"), chatId });
  const kaelView = view.actors.find((a) => a.actorRef.kind === "character");
  // The write SURFACES under the roster character's key — not an orphan cast:Kael the panel never reads.
  expect(kaelView?.name).toBe("Kael");
  expect(kaelView?.volatile?.pools).toEqual([{ name: "focus", value: 7, max: 7 }]);
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

  const view = await h.service.getTrackerView({ principal: principal("host"), chatId });
  const playerView = view.actors.find((a) => a.actorRef.kind === "user");
  expect(playerView?.volatile?.wallet).toEqual([{ name: "gold", amount: 20 }]);
});
