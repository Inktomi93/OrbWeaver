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

import { messages } from "@orb/db";
import type { ChatId, ChatTurnId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { findSnapshotByVariant, resolveSnapshotHead } from "../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { freshDb } from "../../../support/db.ts";
import {
  actorWithWallet,
  addVariant,
  emptyState,
  expect,
  pinExtractionMode,
  principal,
  quest,
  seedLiteGame,
  seedMessage,
  test,
  turnConnection,
} from "./_support.ts";

const HOST = principal(castId<Handle>("host"));

/** The round's delta — deliberately on a DIFFERENT ambient plane than the hand edit below, so "who won" is not
 *  a coin-flip on one field but a question of whether BOTH writers' work is present. */
const ROUND_DELTA = { statePatch: { weather: { type: "fog", label: "nightfall mist" } }, journal: [] };

/** The refused fold's reason must name the FIELD the contract belt rejected, not just that something failed. */
const LOCATION_RE = /location/i;

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

// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// THE FOLD'S OWN VICTIMS — the fresh-context verifier's two driven counterexamples against the first fix.
// ══════════════════════════════════════════════════════════════════════════════════════════════════════════
// Both are about WHAT the fold replays, and WHAT it says when it cannot.
//   CE1 — folding the turn's COMPOSED STATE re-asserted its now-stale base over the human's gesture, and the
//         REMOVAL verbs are where that bit: they deliberately CLEAR the locks of what they removed (the
//         symmetric grammar), so nothing stopped the base's copy of a dismissed actor / deleted quest from
//         being re-inserted. The fold now replays the round's PATCHES, so a datum the round never mentioned
//         cannot be resurrected whatever its lock says.
//   CE2 — a hand row landing at a LATER beat (the user sends their next message mid-flight, then steers) made
//         the fold bail out SILENTLY, erasing the turn's writes with no trail. It now folds into the newer
//         hand head, and every arm that still loses is LOUD.

/** Seed a settled beat that mints an actor + their presence, then lock it in with the ordinary next send. */
async function seedActorBeat(h: Awaited<ReturnType<typeof seedLiteGame>>["h"], chatId: ChatId): Promise<void> {
  h.fakes.toolRoundDelta = { statePatch: { actorState: [actorWithWallet("mara", 3, 2)], presentCharacters: ["npc:mara"] }, journal: [] };
  const beat = await seedMessage(h.ctx.db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, beat.messageId, beat.variantId, castId<ChatTurnId>("chat_turn_seed"), turnConnection());
  const sent = await seedMessage(h.ctx.db, chatId, 2, { role: "user", content: "ok" });
  await h.chatOps.onUserCommit(chatId, sent.messageId);
}

test("CE1: a mid-flight dismissActor is NOT undone by the fold (the round's own write still lands)", async () => {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db, {});
  await pinExtractionMode(h, chatId, "cheap");
  await seedActorBeat(h, chatId);

  // The next beat's round writes only WEATHER — it never mentions the actor, so nothing it wrote can justify
  // her return. Anything that brings her back came from the fold's own stale base.
  h.fakes.toolRoundDelta = ROUND_DELTA;
  const beat = await seedMessage(db, chatId, 3, { role: "assistant" });
  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, beat.messageId, beat.variantId, castId<ChatTurnId>("chat_turn_dismiss"), turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls, 2);
  await expect(h.service.dismissActor({ principal: HOST, chatId, targetRef: { kind: "npc", npcKey: "mara" } })).resolves.toEqual({ ok: true });
  releaseRound();
  await flush;

  const head = await resolveSnapshotHead(db, { id: gameId, chatId });
  expect(head?.row.actorState ?? []).toHaveLength(0); // she STAYS dismissed
  expect(head?.row.presentCharacters ?? []).toHaveLength(0); // and so does her presence
  const view = await h.service.getTrackerView({ principal: HOST, chatId });
  expect(view.actors.some((a) => a.actorRef.kind === "npc" && a.actorRef.npcKey === "mara")).toBe(false);
  expect(view.ambient?.weather?.type).toBe("fog"); // …while the round's own write is not sacrificed to save her
});

test("CE1 (PRODUCTION patch shape): a round that re-authors PRESENCE does not resurrect the dismissed actor", async () => {
  const db = await freshDb();
  // THE SHAPE THE APPLIER ACTUALLY EMITS. `tools/apply.ts::applyUpdateScene` calls `applyPresencePatch` the
  // moment the model touches presence AT ALL, and that returns `presentCharacters` AND `actorState` as WHOLE
  // ARRAYS composed from the round's own base. So a round that merely mentions the scene carries every on-stage
  // actor in its "delta" — and the weather-only pins above never exercised that, which is why the first
  // patch-replaying fix passed them while still resurrecting her here.
  const { chatId, gameId, h } = await seedLiteGame(db, {});
  await pinExtractionMode(h, chatId, "cheap");
  await seedActorBeat(h, chatId);

  h.fakes.toolRoundDelta = {
    statePatch: {
      presentCharacters: ["npc:mara"], // carried from the round's base, not authored
      actorState: [actorWithWallet("mara", 3, 2)], // ditto — byte-identical to what the base already held
      weather: { type: "fog", label: "nightfall mist" }, // the round's ONE genuine write
    },
    journal: [],
  };
  const beat = await seedMessage(db, chatId, 3, { role: "assistant" });
  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, beat.messageId, beat.variantId, castId<ChatTurnId>("chat_turn_p6"), turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls, 2);
  await expect(h.service.dismissActor({ principal: HOST, chatId, targetRef: { kind: "npc", npcKey: "mara" } })).resolves.toEqual({ ok: true });
  releaseRound();
  await flush;

  const head = await resolveSnapshotHead(db, { id: gameId, chatId });
  expect(head?.row.actorState ?? []).toHaveLength(0); // the actor row stays gone
  expect(head?.row.presentCharacters ?? []).toHaveLength(0); // …and so does the presence entry (no GHOST either)
  expect(head?.row.weather?.type).toBe("fog"); // the round's real write still lands
  expect(h.fakes.flushDrops).toEqual([]); // nothing was lost, so nothing is reported
});

test("the tombstone BOUNDARY: a round that genuinely CHANGES the dismissed actor still wins (boarded residual)", async () => {
  const db = await freshDb();
  // The fence on the rebase: it drops what the applier merely CARRIED, never what the round actually wrote.
  // Here the round's actor entry DIFFERS from its base (the wallet moved), so it is a real model write against
  // a lock the dismissal released — and by the recorded cleared-lock semantics it wins. That is the boarded
  // tombstone row, pinned as the deliberate boundary rather than left as an accident.
  const { chatId, gameId, h } = await seedLiteGame(db, {});
  await pinExtractionMode(h, chatId, "cheap");
  await seedActorBeat(h, chatId);

  h.fakes.toolRoundDelta = {
    statePatch: { presentCharacters: ["npc:mara"], actorState: [actorWithWallet("mara", 99, 2)] }, // 3 → 99: a real write
    journal: [],
  };
  const beat = await seedMessage(db, chatId, 3, { role: "assistant" });
  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, beat.messageId, beat.variantId, castId<ChatTurnId>("chat_turn_tomb"), turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls, 2);
  await expect(h.service.dismissActor({ principal: HOST, chatId, targetRef: { kind: "npc", npcKey: "mara" } })).resolves.toEqual({ ok: true });
  releaseRound();
  await flush;

  const head = await resolveSnapshotHead(db, { id: gameId, chatId });
  const mara = head?.row.actorState?.find((a) => a.actorRef.kind === "npc" && a.actorRef.npcKey === "mara");
  expect(mara?.volatile.wallet).toEqual([{ name: "gold", amount: 99 }]); // the round's genuine write survives
});

test("TWO staged writes on ONE flat plane: the fold duplicates nothing (beats and presence stay as narrated)", async () => {
  const db = await freshDb();
  // THE GAP EVERY EARLIER PIN LEFT OPEN: they all staged exactly ONE patch. A turn stages once per tool call,
  // and each applier composes against the accumulator's CURRENT state — so patch 2 already contains patch 1's
  // beat. Rebasing both against the turn's SEED re-scored that beat as a fresh ADD and appended it twice, and
  // the same for a character walking on stage. Nothing downstream saves it: `applyPresencePatch`'s dedupe guard
  // runs at WRITE time, and the folded state goes straight to the hand-row write.
  //
  // The two patches are staged directly (the tools' own seam — `ctx.staging.stage`, one call per tool), which
  // is what a multi-tool turn does, and the round then adds nothing of its own.
  const { chatId, gameId, h } = await seedLiteGame(db, {});
  await pinExtractionMode(h, chatId, "cheap");

  // A REAL first beat, so the opening line is genuinely in the persisted state the hand row will clone from.
  // (A fabricated seed with no persisted counterpart would make the head legitimately lack it, and the pin
  // would be asserting against a head that never had the beat — a different question entirely.)
  h.fakes.toolRoundDelta = { statePatch: { recentEvents: ["opening beat"] }, journal: [] };
  const first = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, first.messageId, first.variantId, castId<ChatTurnId>("chat_turn_open"), turnConnection());
  const sent = await seedMessage(db, chatId, 2, { role: "user", content: "ok" });
  await h.chatOps.onUserCommit(chatId, sent.messageId);

  h.fakes.toolRoundDelta = { statePatch: {}, journal: [] }; // the round adds nothing of its own this beat
  const beat = await seedMessage(db, chatId, 3, { role: "assistant" });
  const turnId = castId<ChatTurnId>("chat_turn_twopatch");

  const seeded = h.ctx.staging.ensure(turnId, { ...emptyState(), recentEvents: ["opening beat"] });
  expect(seeded.recentEvents).toEqual(["opening beat"]);
  // Tool call 1 — composed against the seed, so it carries the opening beat plus its own.
  h.ctx.staging.stage(turnId, { recentEvents: ["opening beat", "she drew her blade"], presentCharacters: ["npc:mari"] });
  // Tool call 2 — composed against the state AFTER call 1, so it carries BOTH prior beats plus its own.
  h.ctx.staging.stage(turnId, {
    recentEvents: ["opening beat", "she drew her blade", "the door slammed"],
    presentCharacters: ["npc:mari", "npc:kai"],
  });

  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, beat.messageId, beat.variantId, turnId, turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls, 2);
  // A hand edit on an UNRELATED field, so the fold runs but claims none of the planes under test.
  await expect(h.service.editSnapshot({ principal: HOST, chatId, patch: { location: "the docks" } })).resolves.toEqual({ ok: true });
  releaseRound();
  await flush;

  const head = await resolveSnapshotHead(db, { id: gameId, chatId });
  // EXACTLY what the accumulator composed — each beat once, in order. A beat narrated once must not be
  // written twice: the panel and the reminder both read this list verbatim.
  expect(head?.row.recentEvents).toEqual(["opening beat", "she drew her blade", "the door slammed"]);
  expect(head?.row.presentCharacters).toEqual(["npc:mari", "npc:kai"]);
  expect(head?.row.location).toBe("the docks"); // the human's field is untouched by any of it
});

test("CE1: a mid-flight deleteQuest is NOT undone by the fold either (the same class, the other removal verb)", async () => {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db, {});
  await pinExtractionMode(h, chatId, "cheap");
  h.fakes.toolRoundDelta = { statePatch: { quests: [quest("k1")] }, journal: [] };
  const first = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, first.messageId, first.variantId, castId<ChatTurnId>("chat_turn_q1"), turnConnection());
  const sent = await seedMessage(db, chatId, 2, { role: "user", content: "ok" });
  await h.chatOps.onUserCommit(chatId, sent.messageId);

  h.fakes.toolRoundDelta = ROUND_DELTA;
  const beat = await seedMessage(db, chatId, 3, { role: "assistant" });
  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, beat.messageId, beat.variantId, castId<ChatTurnId>("chat_turn_q2"), turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls, 2);
  await h.service.deleteQuest({ principal: HOST, chatId, questId: castId("q_k1") }); // returns void, unlike the other hand doors
  releaseRound();
  await flush;

  const head = await resolveSnapshotHead(db, { id: gameId, chatId });
  expect(head?.row.quests ?? []).toHaveLength(0);
  expect(head?.row.weather?.type).toBe("fog");
});

test("CE1 (no race at all): dismiss, then REGEN that slot — the reroll's fold must not resurrect her", async () => {
  const db = await freshDb();
  // A REGRESSION GUARD, not a defect proof — MEASURED green against the pre-fix source too, and the reason is
  // worth keeping: a reroll of slot N bases on `beforeSlot(N)`, which excludes the very beat that minted the
  // actor, so the stale base never carried her and there was nothing to resurrect. The race is what made the
  // class bite (there the minting beat is BELOW the flushing slot and so IS in the base). This pins that the
  // ordinary swipe gesture stays clean under the patch-replaying fold.
  const { chatId, gameId, h } = await seedLiteGame(db, {});
  await pinExtractionMode(h, chatId, "cheap");
  h.fakes.toolRoundDelta = { statePatch: { actorState: [actorWithWallet("mara", 3, 2)], presentCharacters: ["npc:mara"] }, journal: [] };
  const beat = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, beat.messageId, beat.variantId, castId<ChatTurnId>("chat_turn_r1"), turnConnection());
  await expect(h.service.dismissActor({ principal: HOST, chatId, targetRef: { kind: "npc", npcKey: "mara" } })).resolves.toEqual({ ok: true });

  // Reroll the SAME assistant slot: a new variant, selected — the swipe pointer moves with zero snapshot writes.
  const rerolled = await addVariant(db, beat.messageId, 1, "b");
  await db.update(messages).set({ selectedVariantId: rerolled }).where(eq(messages.id, beat.messageId));
  h.fakes.toolRoundDelta = ROUND_DELTA;
  await h.chatOps.onTurnCompleted(chatId, beat.messageId, rerolled, castId<ChatTurnId>("chat_turn_r1b"), turnConnection());

  const head = await resolveSnapshotHead(db, { id: gameId, chatId });
  expect(head?.row.actorState ?? []).toHaveLength(0);
  expect(head?.row.presentCharacters ?? []).toHaveLength(0);
  expect(head?.row.weather?.type).toBe("fog"); // the reroll's own extraction still lands
});

test("CE2: the user sends their NEXT message mid-flight, then steers — the turn's write survives, silent no more", async () => {
  const db = await freshDb();
  // The hand row lands one beat DOWN the story (its as-of stamp is the new tail), so it sits at a seq ABOVE the
  // flushing slot. The first fix bailed out on that mismatch and said NOTHING, erasing the round's write with an
  // empty trail. State planes are cumulative and the round's patches are the newest MODEL knowledge whatever
  // beat produced them, so they are replayed onto the newer hand head — locks arbitrating exactly as ever.
  const { chatId, gameId, h } = await seedLiteGame(db, { toolRoundDelta: ROUND_DELTA });
  await pinExtractionMode(h, chatId, "cheap");
  const beat = await seedMessage(db, chatId, 1, { role: "assistant" });

  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, beat.messageId, beat.variantId, castId<ChatTurnId>("chat_turn_ce2"), turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls, 1);
  await seedMessage(db, chatId, 2, { role: "user", content: "I cross." }); // the next send, while the round is out
  await expect(h.service.editSnapshot({ principal: HOST, chatId, patch: { location: "the drowned chapel" } })).resolves.toEqual({ ok: true });
  releaseRound();
  await flush;

  const view = await h.service.getTrackerView({ principal: HOST, chatId });
  expect(view.ambient?.weather?.type).toBe("fog"); // the turn's write is no longer erased by the later hand row
  expect(view.ambient?.location).toBe("the drowned chapel"); // and the human still holds the field they claimed
  // Nothing was LOST, so nothing is reported — the loud arms are for real losses, not for every fold.
  expect(h.fakes.flushDrops).toEqual([]);
  // The event names the row that is actually head (the FOLD's row, never the turn row the flush wrote).
  const head = await resolveSnapshotHead(db, { id: gameId, chatId });
  const patched = h.fakes.busEvents.filter((e) => e.type === "snapshotPatched");
  expect(patched.at(-1)).toEqual({ type: "snapshotPatched", chatId, snapshotId: head?.row.id });
});

test("the fold's REFUSAL arm fires onFlushDropped (a rejected merge is never silent)", async () => {
  const db = await freshDb();
  // Driving the contract belt through real verbs: the ACCUMULATOR honors the pre-slot BASE's locks while the
  // FOLD honors the hand head's, so a RELEASED lock is what makes the same patch legal in one merge and poison
  // in the other. `location` is non-nullable, so a `null` at it is refused rather than coerced.
  //   1. a hand edit LOCKS `location`;
  //   2. the next round's delta clears it — skipped by the accumulator (the base carries that lock), so the
  //      flush itself writes a perfectly valid row;
  //   3. mid-flight the host RELEASES the lock (empty patch + `releaseLocks` — the "let the model write this
  //      again" gesture), so the fold replays that same `null` with no lock to stop it and the belt refuses.
  const { chatId, h } = await seedLiteGame(db, { toolRoundDelta: { statePatch: { location: "the ford" }, journal: [] } });
  await pinExtractionMode(h, chatId, "cheap");
  const first = await seedMessage(db, chatId, 1, { role: "assistant" });
  await h.chatOps.onTurnCompleted(chatId, first.messageId, first.variantId, castId<ChatTurnId>("chat_turn_ref1"), turnConnection());
  await expect(h.service.editSnapshot({ principal: HOST, chatId, patch: { location: "the drowned chapel" } })).resolves.toEqual({ ok: true });
  const sent = await seedMessage(db, chatId, 2, { role: "user", content: "ok" });
  await h.chatOps.onUserCommit(chatId, sent.messageId);

  h.fakes.toolRoundDelta = { statePatch: { location: null }, journal: [] };
  const beat = await seedMessage(db, chatId, 3, { role: "assistant" });
  let releaseRound = (): void => undefined;
  h.fakes.stateRoundGate = new Promise<void>((resolve) => {
    releaseRound = resolve;
  });
  const flush = h.chatOps.onTurnCompleted(chatId, beat.messageId, beat.variantId, castId<ChatTurnId>("chat_turn_ref2"), turnConnection());
  await untilRoundStarted(h.fakes.toolRoundCalls, 2);
  await expect(h.service.editSnapshot({ principal: HOST, chatId, patch: {}, releaseLocks: ["location"] })).resolves.toEqual({ ok: true });
  releaseRound();
  await flush;

  // The refusal was REPORTED with the field-level reason — the visibility bar every other drop here meets.
  expect(h.fakes.flushDrops).toHaveLength(1);
  expect(h.fakes.flushDrops[0]?.reason).toContain("refused");
  expect(h.fakes.flushDrops[0]?.reason).toMatch(LOCATION_RE);
  // Nothing poisoned: the head is still a readable, contract-valid state (the belt did its job).
  await expect(h.service.getTrackerView({ principal: HOST, chatId })).resolves.toBeDefined();
});
