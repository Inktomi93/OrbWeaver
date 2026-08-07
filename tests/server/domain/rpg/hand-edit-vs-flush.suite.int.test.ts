// tests/server/domain/rpg/hand-edit-vs-flush — THE MID-FLIGHT HAND EDIT vs THE TURN FLUSH. A cross-cutting
// property suite: the behaviour spans `chat-ops/flush.ts` (the write base is read at flush START, then the round
// runs 0.8-2.9s), `snapshot-edit.ts` (the hand door resolves the ladder head at EDIT time) and
// `persistence/snapshots.ts` (the D124 ladder decides which of the two rows a later read resolves) — no single
// source mirrors it, so it is a `.suite.int.test.ts` (the `swipe-consistency` precedent).
//
// THE RACE. A host hand-edits the tracker panel while a turn's post-commit state round is still in flight. Two
// writers then aim at the same slot from two bases neither of which re-reads at its write boundary:
//   • the flush writes `preSlotBase + delta` (VER-1a) — a base resolved BEFORE the hand edit existed;
//   • the hand door writes head + patch, AUTO-LOCKING every field it touched (manual-edit-wins).
// The window is REAL and wide (the dedicated state round is a model call — `flush-barrier.ts` measures it at
// 0.8-2.9s), and it is the exact moment a host steers: they read the beat, they fix the location, the round
// lands on top. Both losses below were live-suspected and never chased; both reproduce deterministically here
// by holding the round on the harness's `stateRoundGate` (never a timing guess).
//
// THE INVARIANT THESE PIN — NEITHER WRITER MAY DISAPPEAR:
//   • the HAND EDIT survives the flush (it is a human decision, and it carries an auto-lock that the
//     manual-edit-wins law says a model write can never overwrite);
//   • the TURN'S OWN WRITES survive the hand edit on every plane the hand did NOT touch (a hand edit to the
//     location is not a licence to drop the round's weather — the lock names exactly what the human claimed).
// Both are asserted through `getTrackerView` — the projection the panel actually renders — so a pass means the
// host SEES both, not merely that two rows exist somewhere.
//
// TWO WINDOWS, because the ladder resolves differently in each:
//   A. SINGLE SPEAKER — the flushing turn's slot IS the chat tail, so the hand write clone-forwards as a HAND
//      row stamped at that slot, and a hand row outranks the turn row at the same seq (D124).
//   B. BACK-TO-BACK ASSISTANT TURNS (a group round: no user message between speakers, so the previous turn's
//      snapshot is still `committed=0`) — the ladder's turn arm finds the tail slot has no snapshot YET (that
//      is what "in flight" means) and degrades to the game-wide fallback, which hands the hand door an OLDER
//      slot's uncommitted row.

import type { ChatTurnId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { findSnapshotByVariant } from "../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, pinExtractionMode, principal, seedLiteGame, seedMessage, test, turnConnection } from "./_support.ts";

const HOST = principal(castId<Handle>("host"));

/** The round's delta — deliberately on a DIFFERENT ambient plane than the hand edit below, so "who won" is not
 *  a coin-flip on one field but a question of whether BOTH writers' work is present. */
const ROUND_DELTA = { statePatch: { weather: { type: "fog", label: "nightfall mist" } }, journal: [] };

/** Park until the state round has actually STARTED (it records its call before awaiting the gate), so the hand
 *  edit provably lands MID-flight. A fixed tick count would be a guess that passes or fails by machine speed —
 *  this barriers on the settled fact (the `flush.int.test.ts` precedent). */
function untilRoundStarted(calls: readonly unknown[], want: number): Promise<void> {
  const poll = (attemptsLeft: number): Promise<void> => {
    if (calls.length >= want) {
      return Promise.resolve();
    }
    if (attemptsLeft === 0) {
      return Promise.reject(new Error(`the state round never started (wanted ${want} calls) — the edit would not have been mid-flight`));
    }
    return new Promise((resolve) => setTimeout(resolve, 5)).then(() => poll(attemptsLeft - 1));
  };
  return poll(400);
}

test("A (single speaker): a hand edit mid-flight survives the flush — AND the round's own plane still lands", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta: ROUND_DELTA });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  // HOLD the round in flight — the real 0.8-2.9s window, made deterministic.
  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, messageId, variantId, castId<ChatTurnId>("chat_turn_solo"), turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls, 1);

  // The host steers mid-beat. It is accepted (a hand edit is never refused for being concurrent).
  await expect(h.service.editSnapshot({ principal: HOST, chatId, patch: { location: "the drowned chapel" } })).resolves.toEqual({ ok: true });

  releaseRound();
  await flush;

  // The round DID produce a delta — its absence below would be the defect, never an empty extraction.
  expect(h.fakes.toolRoundCalls).toHaveLength(1);
  const view = await h.service.getTrackerView({ principal: HOST, chatId });
  // The human's decision stands (manual-edit-wins — and the auto-lock says a model write may never take it).
  expect(view.ambient?.location).toBe("the drowned chapel");
  // …and the turn's OWN write, on a plane the hand never touched, is still there. Before the fix the hand row
  // shadowed the whole turn row on the ladder, so the round's weather was invisible from the instant it landed
  // and stayed invisible for every later read (each later base walk resolves the same hand row).
  expect(view.ambient?.weather?.type).toBe("fog");
});

test("B (back-to-back assistant turns): a hand edit mid-flight of the SECOND turn is not overwritten", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta: ROUND_DELTA });
  await pinExtractionMode(h, chatId, "cheap");

  // Speaker 1's turn flushes clean. NO user message follows, so its snapshot stays `committed=0` — the group
  // round's real shape, and the state that makes the ladder's game-wide fallback reachable.
  const first = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, first.messageId, first.variantId, castId<ChatTurnId>("chat_turn_sp1"), turnConnection());
  expect(await findSnapshotByVariant(db, first.variantId)).toBeDefined();

  // Speaker 2's turn — its round held in flight.
  const second = await seedMessage(db, chatId, 2, { role: "assistant" });
  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, second.messageId, second.variantId, castId<ChatTurnId>("chat_turn_sp2"), turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls, 2);

  await expect(h.service.editSnapshot({ principal: HOST, chatId, patch: { location: "the drowned chapel" } })).resolves.toEqual({ ok: true });

  releaseRound();
  await flush;

  const view = await h.service.getTrackerView({ principal: HOST, chatId });
  // The clobber the board suspected: before the fix the edit landed IN PLACE on SPEAKER 1's still-uncommitted
  // row (the ladder's turn arm sees no snapshot on the tail slot while the flush is in flight and degrades to
  // the game-wide fallback), and speaker 2's flush then wrote a strictly-later row from its pre-edit base — so
  // the host's edit vanished silently, lock and all.
  expect(view.ambient?.location).toBe("the drowned chapel");
  // The second speaker's own write still lands too — the fix must not trade one loss for the other.
  expect(view.ambient?.weather?.type).toBe("fog");
});

test("SAME field, both writers: the HUMAN's value stands (manual-edit-wins, to the letter)", async () => {
  const db = await freshDb();
  // The head-on collision: the round and the host both write `location` in the same window. The recorded law
  // has no ambiguity — `editSnapshot` auto-locks what the hand touched precisely so "a later model tool write
  // can never overwrite it" — so the reconciliation must resolve to the human, not to whoever wrote last.
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta: { statePatch: { location: "the ford", weather: { type: "fog", label: "" } }, journal: [] } });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });

  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, messageId, variantId, castId<ChatTurnId>("chat_turn_clash"), turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls, 1);
  await expect(h.service.editSnapshot({ principal: HOST, chatId, patch: { location: "the drowned chapel" } })).resolves.toEqual({ ok: true });
  releaseRound();
  await flush;

  const view = await h.service.getTrackerView({ principal: HOST, chatId });
  expect(view.ambient?.location).toBe("the drowned chapel"); // the LOCKED field is the human's
  expect(view.ambient?.weather?.type).toBe("fog"); // the unlocked one is still the round's — the lock scopes the win
});

// ── THE PRE-FIRST-TURN WINDOW (the owner's own sighting: "editing the first message before sending") ──────
// Two different moments hide under that one sentence, and they behave differently — so both are pinned.
// MEASURED against HEAD source (the red-first run): the BEFORE-SENDING edit was already correct and is a
// regression guard only; the MID-FLIGHT-OF-THE-FIRST-TURN edit was arm A and was losing the round's writes.

test("pre-first-turn: a hand edit made BEFORE any turn rides into the first turn's base (regression guard)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta: ROUND_DELTA });
  await pinExtractionMode(h, chatId, "cheap");
  // A fresh chat's GREETING — an opening assistant message with no turn ever flushed behind it.
  await seedMessage(db, chatId, 1, { role: "assistant", content: "You stand at the ford." });

  await expect(h.service.editSnapshot({ principal: HOST, chatId, patch: { location: "the drowned chapel" } })).resolves.toEqual({ ok: true });

  // The user sends; the first real turn commits and flushes onto a LATER slot.
  await seedMessage(db, chatId, 2, { role: "user", content: "I cross." });
  const first = await seedMessage(db, chatId, 3, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, first.messageId, first.variantId, castId<ChatTurnId>("chat_turn_pre"), turnConnection());

  // Nothing is lost here and never was: the hand row sits at a seq strictly BELOW the first turn's slot, so it
  // is inside that flush's write base rather than racing it — the edit rides forward and its lock rides with it.
  const view = await h.service.getTrackerView({ principal: HOST, chatId });
  expect(view.ambient?.location).toBe("the drowned chapel");
  expect(view.ambient?.weather?.type).toBe("fog");
});

test("pre-first-turn: an edit landing MID-FLIGHT of the very FIRST turn keeps both writers (arm A, first beat)", async () => {
  const db = await freshDb();
  // Same window one beat later — the host reads the opening reply and edits while its state round is still out.
  // A game with no prior snapshot at all is the shape most likely to be hit on a brand-new chat.
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta: ROUND_DELTA });
  await pinExtractionMode(h, chatId, "cheap");
  await seedMessage(db, chatId, 1, { role: "assistant", content: "You stand at the ford." });
  await seedMessage(db, chatId, 2, { role: "user", content: "I cross." });
  const first = await seedMessage(db, chatId, 3, { role: "assistant" });

  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, first.messageId, first.variantId, castId<ChatTurnId>("chat_turn_first"), turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls, 1);
  await expect(h.service.editSnapshot({ principal: HOST, chatId, patch: { location: "the drowned chapel" } })).resolves.toEqual({ ok: true });
  releaseRound();
  await flush;

  const view = await h.service.getTrackerView({ principal: HOST, chatId });
  expect(view.ambient?.location).toBe("the drowned chapel");
  expect(view.ambient?.weather?.type).toBe("fog"); // was `null` on HEAD source — the first beat lost the round
});

test("no flush in flight: the hand door still writes IN PLACE on the settled turn's own draft row (unchanged)", async () => {
  const db = await freshDb();
  // The legitimate in-place case the fix must NOT break: the turn has SETTLED, its `committed=0` row is the
  // ladder's turn rung for the tail slot, and an edit rides that row rather than minting a hand row (the
  // swipe-consistent write — `snapshot-edit.ts`'s UNCOMMITTED-TURN-head arm).
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta: ROUND_DELTA });
  await pinExtractionMode(h, chatId, "cheap");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, messageId, variantId, castId<ChatTurnId>("chat_turn_settled"), turnConnection());

  await expect(h.service.editSnapshot({ principal: HOST, chatId, patch: { location: "the ford" } })).resolves.toEqual({ ok: true });

  // The edit landed ON the turn's own variant-keyed row — no clone-forward, so a swipe of this slot still
  // carries the host's edit with it.
  const row = await findSnapshotByVariant(db, variantId);
  expect(row?.location).toBe("the ford");
  expect(row?.weather?.type).toBe("fog"); // the round's write is on the same row, untouched
  expect(row?.fieldLocks).toEqual({ location: true });
});
