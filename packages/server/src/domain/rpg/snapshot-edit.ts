// domain/rpg/snapshot-edit — the shared hand-edit machinery over the CURRENT resolved snapshot (rpg-design/05
// §4.4). A domain-root I/O-wrapping helper (the `turn-staging.ts`/`guard.ts` I/O-root precedent — it awaits
// the db + can't live in zero-I/O `substrate/`, and verb-to-verb VALUE imports are banned).
// editSnapshot / upsertQuest / deleteQuest / patchActor / dismissActor all write the swipe-volatile plane by
// hand; they share ONE mechanism: resolve the current snapshot (the resolution-ladder head), produce the next
// state, AUTO-LOCK every touched field (manual-edit-wins — a later model tool write can never overwrite it),
// and persist. TWO DOORS onto that one mechanism:
//   • `applyHandEdit(patch)` — the IMAGE door ([merge-clear] overlay, hand-always-wins via `fieldLocks: null`).
//   • `writeHandState(derive)` — the READ-MODIFY-WRITE door (R1): the caller derives the next state from the
//     head INSIDE the write's own resolve, so an op-shaped verb never carries a client image that can go
//     stale (the stale-image clobber class, `substrate/actor-ops.ts`). `applyHandEdit` is now a thin arm of it.
// TWO write targets by head state:
//   • UNcommitted TURN head (this turn's draft) ⇒ write IN PLACE on the live variant (swipe-consistent).
//   • COMMITTED head, a HAND-row head, OR a turnless game (no snapshot rows — the no-born-seed ruling) ⇒
//     CLONE FORWARD as a new HAND ROW (D124: no message, no variant, stamped `asOfMessageId` = the chat's
//     tail slot). An in-place write on a committed snapshot would corrupt a locked-in past (a checkpoint's
//     frozen state, a past swipe) — so a committed head is never mutated; play continues on the new row. The
//     turnless case is the same forward-write, off the synthesized default state. This write posts NOTHING to
//     the message plane: the old empty-body "state anchor" slot it used to mint was a non-message that every
//     canon reader had to filter (render, export, digest, plugin, automation, counts), and the row class is
//     now unspellable — `postNarratorMessage` refuses blank content.
// THE THIRD DOOR IS THE FLUSH'S (HAND-EDIT-VS-FLUSH, 2026-08-07): `foldTurnWriteIntoHandHead` is what a turn's
// flush calls at its own write boundary when a HAND ROW outranks the row it just wrote. It is not a fourth
// mechanism — it is `writeHandState` again, deriving `applyLockedPatch(handState, turnColumns, handLocks)`
// inside the same head resolve. The two writers can no longer erase each other: a mid-flight hand edit keeps
// every field it locked (that is what the auto-lock above MEANS), and the turn keeps every plane the hand did
// not claim. See that function for the loss it closes and why the ranking that caused it is nonetheless right.
//
// It also homes the two STATE READERS every other surface projects from — `currentSnapshotState` (the head) and
// `snapshotStateBeforeSlot` (the state before a slot: the flush's write base + a regen turn's read base) — so
// "which snapshot am I reasoning from, and what does a game with no rows read?" is answered in ONE place.

import type { RpgFieldLocks, RpgSnapshotState } from "@orb/contracts/rpg";
import { rpgSnapshotStateSchema } from "@orb/contracts/rpg";
import type { MessageId, MessageVariantId, RpgSnapshotId } from "@orb/kit/ids";
import type { StagedPatch } from "./contract/params.ts";
import type { HandEditLocks, HandEditResult, HandStateHead, HandStateWrite, RpgContext, RpgGameRow, TurnWriteFoldOutcome } from "./contract/service.ts";
import { snapshotRowToState } from "./contract/service.ts";
import { findLatestAssistantSlotSeq, resolveSnapshotBeforeSlot, resolveSnapshotHead, updateSnapshotState, writeHandSnapshot } from "./persistence/snapshots.ts";
import { defaultSnapshotState } from "./substrate/default-state.ts";
import { applyLockedPatch, rebasePatchOntoHead } from "./substrate/merge.ts";

/** The `committed` column's draft value — an UNcommitted TURN row is the only in-place-editable head. */
const UNCOMMITTED = 0;

/** The current resolved snapshot head, plus the ONE question the write tail asks of it: may this row be
 *  edited IN PLACE? `inPlace` is non-null ONLY for an UNCOMMITTED TURN row that is the ladder's own TURN RUNG
 *  (this turn's own draft) — a committed row is a locked-in past, a HAND row is born committed, and a turnless
 *  game has no row at all; all three clone forward as a new hand row.
 *
 *  THE ARM CHECK IS THE FIX, NOT A BELT (HAND-EDIT-VS-FLUSH, 2026-08-07). "Uncommitted turn row" alone does
 *  NOT mean "this turn's draft", and the gap is reachable in ordinary play: while a turn's post-commit state
 *  round is in flight its slot has NO snapshot yet (that is what in-flight means), so the ladder's turn arm
 *  comes back empty and the game-wide `fallback` walk answers with the PREVIOUS speaker's still-uncommitted
 *  draft — a row at an EARLIER slot. Editing that in place put the host's edit on a row the in-flight flush's
 *  own row then strictly outranked, and the edit vanished silently, auto-lock and all (a group round is the
 *  live shape: two assistants speak back-to-back, so no `onUserCommit` has locked the first row in). Requiring
 *  the `turn` ARM makes `inPlace` mean what its name says; the fallback case correctly clones forward instead,
 *  where the hand row's ladder rung protects it. */
async function resolveHead(
  ctx: RpgContext,
  game: RpgGameRow,
): Promise<{
  inPlace: { snapshotId: RpgSnapshotId; variantId: MessageVariantId } | null;
  state: RpgSnapshotState;
  locks: RpgFieldLocks | null;
}> {
  const head = await resolveSnapshotHead(ctx.db, { id: game.id, chatId: game.chatId });
  if (head === undefined) {
    return { inPlace: null, state: defaultSnapshotState(), locks: null };
  }
  const { row } = head;
  return {
    inPlace: head.arm === "turn" && row.variantId !== null && row.committed === UNCOMMITTED ? { snapshotId: row.id, variantId: row.variantId } : null,
    state: snapshotRowToState(row),
    locks: row.fieldLocks,
  };
}

/** The state columns `updateSnapshotState` accepts (the full volatile plane). Derived from the state shape so
 *  a new plane is covered without a re-spell. */
type StateColumns = Pick<
  RpgSnapshotState,
  "clock" | "calendarDate" | "location" | "weather" | "presentCharacters" | "recentEvents" | "actorState" | "trackerValues" | "quests" | "plot"
>;

function toColumns(state: RpgSnapshotState): StateColumns {
  return {
    clock: state.clock,
    calendarDate: state.calendarDate,
    location: state.location,
    weather: state.weather,
    presentCharacters: state.presentCharacters,
    recentEvents: state.recentEvents,
    actorState: state.actorState,
    trackerValues: state.trackerValues,
    quests: state.quests,
    plot: state.plot,
  };
}

/** Apply a hand patch to the current snapshot with an auto-lock DELTA. `patch` is a partial snapshot-state
 *  overlay; `locks.lock` are dotted paths to auto-lock (editSnapshot locks every touched top-level key; the
 *  quest verbs lock `quests.<id>`), `locks.clear` are paths to un-lock (deleteQuest drops the removed quest's
 *  lock — a deleted element leaves no ghost lock, the symmetric grammar). The hand edit ALWAYS WINS: the
 *  overlay runs with NO lock-honoring (`fieldLocks: null`), because the human editor is the authority a lock
 *  exists to protect — a lock blocks a later TOOL write, never the human re-editing/removing their own locked
 *  field (that would trap the host). The lock delta is applied to the existing locks and written with the
 *  state. The [merge-clear] contract still governs the overlay shape (`{}` = no-op, null = leaf clear).
 *
 *  THE F1 WRITE-BOUNDARY BACKSTOP APPLIES HERE TOO (D108's "canon never corrupted is STRUCTURAL"): the merged
 *  state is validated against the full contract schema BEFORE any durable write, exactly as `writeStagedSnapshot`
 *  validates the model path. The hand path reaches the same columns with a caller-shaped overlay, so it can
 *  produce the same poison — a `null` cleared onto a NON-nullable leaf (`location`, the arrays, the records)
 *  is the reachable case, and the merge-clear contract is right to write it: it is the CONTRACT, not the merge,
 *  that says which leaves clear. The refusal returns as data (never a wire reject — `inputs.ts`) and nothing is
 *  written, so the caller learns WHY instead of watching a value snap back. */
export function applyHandEdit(ctx: RpgContext, game: RpgGameRow, patch: Record<string, unknown>, locks: HandEditLocks = {}): Promise<HandEditResult> {
  return writeHandState(ctx, game, (head) => ({
    ok: true,
    state: applyLockedPatch(head.state as unknown as Record<string, unknown>, patch, null) as unknown as RpgSnapshotState,
    locks,
  }));
}

/** THE READ-MODIFY-WRITE hand door (R1) — the same resolve, parse, lock-delta and clone-forward tail as
 *  `applyHandEdit`, but the caller DERIVES the next state from the head instead of handing in an image.
 *  This is what makes an op-shaped write clobber-free: the row an op is applied to is read INSIDE the same
 *  head resolve that the write commits against, so a model flush that landed after the panel's read is the
 *  base the op builds on — it can no longer be overwritten field-by-field by a client image read a beat ago
 *  (`substrate/actor-ops.ts` header — the stale-image clobber class). `derive` also sees the head's LOCKS, so
 *  a removal gesture can release exactly the pins its element carried (`dismissActor`, the `deleteQuest`
 *  symmetric-lock precedent), and it may REFUSE as data (an op naming a datum the head does not carry) before
 *  anything durable happens — no row, no slot, no locks. */
export async function writeHandState(ctx: RpgContext, game: RpgGameRow, derive: (head: HandStateHead) => HandStateWrite): Promise<HandEditResult> {
  const head = await resolveHead(ctx, game);
  const derived = derive({ state: head.state, locks: head.locks });
  if (!derived.ok) {
    return { ok: false, reason: derived.reason };
  }
  const nextState = derived.state;
  const locks = derived.locks ?? {};
  const parsed = rpgSnapshotStateSchema.safeParse(nextState);
  if (!parsed.success) {
    // Refused BEFORE any durable write — a rejected edit leaves no row behind.
    return { ok: false, reason: parsed.error.message };
  }
  const nextLocks: RpgFieldLocks = { ...(head.locks ?? {}) };
  for (const path of locks.lock ?? []) {
    nextLocks[path] = true;
  }
  for (const path of locks.clear ?? []) {
    delete nextLocks[path];
  }
  if (head.inPlace !== null) {
    // In-place on the live UNcommitted variant (this turn's draft head — swipe-consistent).
    await updateSnapshotState(ctx.db, head.inPlace.variantId, { ...toColumns(nextState), fieldLocks: nextLocks });
    return { ok: true, snapshotId: head.inPlace.snapshotId };
  }
  // A COMMITTED head, a HAND-row head, or a turnless game must NOT be edited in place — that would corrupt a
  // locked-in past (a checkpoint's frozen state, a past swipe). CLONE FORWARD as a new HAND ROW (D124): no
  // message posted, no variant, ordered by the chat's tail slot. Nothing lands on the message plane at all.
  const snapshotId = ctx.ids.snapshot();
  await writeHandSnapshot(ctx.db, nextState, nextLocks, { id: snapshotId, gameId: game.id, chatId: game.chatId, now: ctx.now() });
  return { ok: true, snapshotId };
}

/** REPLAY a just-written turn flush's own writes onto the HAND ROW that outranks it — the write-boundary half
 *  of the HAND-EDIT-VS-FLUSH fix. Always returns a TOTAL {@link TurnWriteFoldOutcome} carrying the id that is
 *  head afterwards; the caller emits that id and logs the two losing arms.
 *
 *  THE LOSS IT CLOSES. A turn's flush resolves its write base at flush START and its round then runs a 0.8-2.9s
 *  model call (`flush-barrier.ts`). A host hand-editing the panel inside that window writes a HAND ROW stamped
 *  at the flushing turn's own slot — and by D124 a hand row OUTRANKS the turn row at the same seq (you edited on
 *  top of that beat). That ranking is right and stays: the human's decision wins. But the hand row was cloned
 *  from a head that did not yet contain the turn's writes, so it shadowed the turn row's state ENTIRELY — the
 *  round's writes on planes the human never touched became invisible the instant they landed, and stayed
 *  invisible forever (every later base walk resolves the same hand row). One race, two victims; this is the
 *  second one. The same shadowing is reachable without any race — a hand edit made at the tail slot before a
 *  REGEN of that slot is excluded from the regen's base the same way — so the fold is not gated on timing.
 *
 *  IT REPLAYS THE PATCHES, NEVER THE COMPOSED STATE (the fix leg's regression, verifier-driven). The turn's
 *  `state` is `preSlotBase + writes`, and the base half of it is STALE the instant a hand edit lands. Folding
 *  the whole state re-asserted that stale base over the human's gesture, and the REMOVAL verbs are where it
 *  bit: `dismissActor`/`deleteQuest` deliberately CLEAR the locks of what they removed (the symmetric grammar —
 *  a deleted element leaves no ghost lock), so nothing stopped the base's copy of the dismissed actor from
 *  being re-inserted by the keyed-additive merge. A host who dismissed an actor mid-flight watched her come
 *  back. Replaying only what the round WROTE kills that class structurally: a datum the round never mentioned
 *  is not in any patch and therefore cannot be resurrected by the fold, whatever its lock says.
 *
 *  THE ARBITER IS THE LOCK, and it is already law: `editSnapshot` auto-locks every field the hand touched
 *  precisely so "a later model tool write can never overwrite it" (this file's header). Each patch is replayed
 *  with `applyLockedPatch` against the HAND head's CURRENT locks — the identical grammar, in the identical
 *  order, that the staging accumulator used to compose them in the first place. The human keeps every field
 *  they claimed; the turn keeps every field they did not.
 *
 *  A NEWER HAND HEAD IS STILL FOLDED INTO (the second verifier counterexample). If the user sends their next
 *  message mid-flight and then steers, the hand row lands one beat DOWN the story and the earlier shape bailed
 *  out silently, erasing the turn's writes with no trail at all. The state planes are cumulative and the
 *  round's patches are the newest MODEL knowledge regardless of which beat produced them, so replaying them
 *  onto the newer hand head is right — and the human's locks arbitrate exactly as they do at the same beat.
 *
 *  WHAT IS *NOT* FOLDED: a flush for a slot that is no longer the story's current beat (`slotSeq` below
 *  {@link findLatestAssistantSlotSeq}) — that is a REGEN of an old message, whose row is legitimately
 *  superseded by the beats after it. Injecting an old beat's consequences into the present would be the
 *  resurrection bug wearing the fix's clothes, and shouting about it would be noise about the normal case.
 *
 *  IT RIDES `writeHandState`, WHICH IS WHY IT IS SAFE UNDER A SECOND EDIT. The fold derives INSIDE its own head
 *  resolve, so a hand edit that landed between the arm check and this write is the base it replays onto (never
 *  a stale image), and one that lands after produces a strictly later rung that outranks the fold. The residual
 *  is the same single-continuation window the hand door has always had (ASSUMES(single-replica), as everywhere
 *  in this loop) — this adds no new one. */
export async function foldTurnWriteIntoHandHead(
  ctx: RpgContext,
  game: RpgGameRow,
  written: { readonly patches: readonly StagedPatch[]; readonly snapshotId: RpgSnapshotId },
  slotSeq: number,
): Promise<TurnWriteFoldOutcome> {
  const head = await resolveSnapshotHead(ctx.db, { id: game.id, chatId: game.chatId });
  if (head === undefined || head.row.id === written.snapshotId) {
    // We ARE head (the ordinary flush). `undefined` is unreachable in practice — we just inserted a row — but
    // it resolves to the same answer, so it needs no branch of its own.
    return { kind: "head", headId: written.snapshotId };
  }
  const currentBeat = await findLatestAssistantSlotSeq(ctx.db, game.chatId);
  if (currentBeat !== undefined && currentBeat > slotSeq) {
    // A REGEN of an earlier message. Its row is superseded by later beats BY DESIGN — not a loss, not a fold.
    return { kind: "head", headId: head.row.id };
  }
  if (head.arm !== "hand") {
    // A non-hand row outranks us AT OUR OWN BEAT: a sibling variant selected by a mid-flight swipe, or the
    // game-wide fallback answering. There is no hand gesture to reconcile against and no defensible merge —
    // but the turn's writes ARE lost, so the caller says so.
    //
    // TRUTH-REPAIR (leg 3): this comment used to also claim "a concurrent later turn". It does NOT reach here
    // — the regen guard above returns first for any head past our beat, so a later turn that flushed while we
    // were in flight is classified as a supersede and stays SILENT. The re-verifier DROVE that loss (speaker 2
    // commits mid-flight, speaker 1's write gone, empty trail); it is the boarded REGEN-VS-LATER-FLUSH row,
    // which needs ladder state that does not exist today. Naming it here so the next reader finds the row
    // instead of trusting a comment that denied the case.
    return { kind: "shadowed", headId: head.row.id, reason: `the ${head.arm} row ${head.row.id} outranks this flush's row at seq ${head.seq}` };
  }
  const folded = await writeHandState(ctx, game, (hand) => {
    // Replayed in STAGE ORDER against the hand head's CURRENT locks — the identical composition the accumulator
    // performed over the pre-slot base, differing only in which state it starts from and whose locks arbitrate.
    //
    // REBASED FIRST (leg 3): every applier in `tools/apply.ts` composes WHOLE PLANES from the base it was
    // handed, so a staged patch is not a delta — a round that merely mentions the scene carries every on-stage
    // actor in it. Replaying that verbatim re-inserted an actor the host had dismissed mid-flight, silently,
    // because the removal verbs release the very lock that would have stopped it. The rebase keeps what the
    // round ADDED, CHANGED or REMOVED and drops what it merely CARRIED (`substrate/merge.ts`).
    //
    // EACH ENTRY AGAINST ITS OWN BASE (leg 4): a turn stages once per tool call, and patch N was composed
    // against `seed + patches[0..N-1]`. Measuring every patch against the SEED re-scored an element patch 1
    // had already added as a fresh ADD for patch 2 and appended it a second time — two `update_scene` calls
    // wrote the opening beat twice and put a character on stage twice. The pairing is carried by the
    // accumulator (`StagedPatch`), so the invariant is local: patch N's diff is measured against the state
    // patch N actually saw.
    let state = hand.state as unknown as Record<string, unknown>;
    for (const staged of written.patches) {
      const stagedBase = staged.base as unknown as Record<string, unknown>;
      state = applyLockedPatch(state, rebasePatchOntoHead(staged.patch, stagedBase, state), hand.locks);
    }
    return { ok: true, state: state as unknown as RpgSnapshotState };
  });
  return folded.ok ? { kind: "folded", headId: folded.snapshotId } : { kind: "refused", headId: head.row.id, reason: folded.reason };
}

/** The current resolved snapshot state (a read the tracker view + the quest verbs project from). For a turnless
 *  game (no snapshot rows) this is the synthesized default steady-state (the orchestrator no-born-seed ruling). */
export async function currentSnapshotState(ctx: RpgContext, game: RpgGameRow): Promise<RpgSnapshotState> {
  return (await resolveHead(ctx, game)).state;
}

/** The state as of the slot BEFORE `messageId` — the head's sibling reader, and the ONE home for "row-or-born-
 *  default before this slot" (both the flush's WRITE base and a regen turn's READ base resolve through here, so
 *  the two can never disagree about what a turn reasons from).
 *
 *  VER-1a (write) — a reroll mints a NEW variant on an EXISTING slot, and the rejected variant's snapshot is
 *  `base + that variant's delta`; basing the fresh extraction on the head would stack it on its own dead
 *  sibling (the live-confirmed duplicate-beat class). VER-1b (read) — the same slot exclusion is what a REGEN's
 *  reminder + delta block must read, or the model is told the abandoned variant's beats and paraphrases them
 *  back. For a FRESH turn (a slot with no snapshots of its own) this resolves byte-identically to the head. */
export async function snapshotStateBeforeSlot(ctx: RpgContext, game: RpgGameRow, messageId: MessageId): Promise<RpgSnapshotState> {
  const row = await resolveSnapshotBeforeSlot(ctx.db, { id: game.id, chatId: game.chatId }, messageId);
  return row === undefined ? defaultSnapshotState() : snapshotRowToState(row);
}
