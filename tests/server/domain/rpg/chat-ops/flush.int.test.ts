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

import type { ChatId, ChatTurnId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { RpgRosterActor } from "../../../../../packages/server/src/domain/rpg/index";
import { rpgToolDefinitions } from "../../../../../packages/server/src/domain/rpg/index";
import { listJournalByVariant } from "../../../../../packages/server/src/domain/rpg/persistence/journal";
import { findSnapshotByVariant } from "../../../../../packages/server/src/domain/rpg/persistence/snapshots";
import type { ToolExecutionContext } from "../../../../../packages/server/src/domain/tool-use";
import { freshDb } from "../../../../support/db";
import { emptyState, expect, principal, seedLiteGame, seedMessage, test } from "../_support";

const TURN: ChatTurnId = castId<ChatTurnId>("chat_turn_t1");

function exec(chatId: ChatId, turnId: ChatTurnId): ToolExecutionContext {
  return { principal: principal("host"), triggeredBy: castId("user_host"), chatId, turnId, roster: null };
}

test("cheap mode: the mid-turn staged tool writes flush onto the committed variant", async () => {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "cheap" });
  // A committed assistant slot the snapshot keys to.
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  // Simulate a cheap-mode tool: ensure the turn bucket from an empty base, stage a location write.
  h.ctx.staging.ensure(TURN, emptyState());
  h.ctx.staging.stage(TURN, { location: "the cave mouth" });
  h.fakes.busEvents.length = 0; // drop the createGame/updateConfig emits — assert the flush emit alone

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN);

  const snap = await findSnapshotByVariant(db, variantId);
  expect(snap?.location).toBe("the cave mouth");
  expect(snap?.committed).toBe(0); // born uncommitted — the next user send locks it in
  expect(snap?.gameId).toBe(gameId);
  // Cheap mode never calls the extraction op.
  expect(h.fakes.extractionCalls).toHaveLength(0);
  // §4.9: the flush emitted `snapshotPatched` (no journal ⇒ no `journalChanged`).
  expect(h.fakes.busEvents).toEqual([{ type: "snapshotPatched", chatId, snapshotId: snap?.id }]);
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

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN);

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

  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN);

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
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN);

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
    fieldLocks: null,
  });
  h.ctx.staging.stageJournal(TURN, { type: "note", title: "beat", content: "c" });

  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN);

  // The invalid state was REFUSED at the write boundary — NO snapshot committed (canon uncorrupted).
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
  // The journal rode the same atomic drop — no orphan beat referencing a snapshot that never landed.
  const journal = await h.service.listJournal({ principal: principal("host"), chatId, limit: 50 });
  expect(journal).toEqual([]);
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
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN);

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
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN);

  const view = await h.service.getTrackerView({ principal: principal("host"), chatId });
  const playerView = view.actors.find((a) => a.actorRef.kind === "user");
  expect(playerView?.volatile?.wallet).toEqual([{ name: "gold", amount: 20 }]);
});
