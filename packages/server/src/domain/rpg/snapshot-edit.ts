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
import type { HandEditLocks, HandEditResult, HandStateHead, HandStateWrite, RpgContext, RpgGameRow } from "./contract/service.ts";
import { snapshotRowToState } from "./contract/service.ts";
import { resolveSnapshotBeforeSlot, resolveSnapshotHead, updateSnapshotState, writeHandSnapshot } from "./persistence/snapshots.ts";
import { defaultSnapshotState } from "./substrate/default-state.ts";
import { applyLockedPatch } from "./substrate/merge.ts";

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

/** FOLD a just-written turn flush's state into the HAND ROW that outranks it — the write-boundary half of the
 *  HAND-EDIT-VS-FLUSH fix (2026-08-07). Returns `null` when there is nothing to reconcile (the ordinary flush),
 *  otherwise the hand-arm write's result.
 *
 *  THE LOSS IT CLOSES. A turn's flush resolves its write base at flush START and its round then runs a 0.8-2.9s
 *  model call (`flush-barrier.ts`). A host hand-editing the panel inside that window writes a HAND ROW stamped
 *  at the flushing turn's own slot — and by D124 a hand row OUTRANKS the turn row at the same seq (you edited on
 *  top of that beat). That ranking is right and stays: the human's decision wins. But the hand row was cloned
 *  from a head that did not yet contain the turn's delta, so it shadowed the turn row's state ENTIRELY — the
 *  round's writes on planes the human never touched became invisible the instant they landed, and stayed
 *  invisible forever (every later base walk resolves the same hand row). One race, two victims; this is the
 *  second one. The same shadowing is reachable without any race — a hand edit made at the tail slot before a
 *  REGEN of that slot is excluded from the regen's base the same way — so the fold is not gated on timing.
 *
 *  THE ARBITER IS THE LOCK, and it is already law: `editSnapshot` auto-locks every field the hand touched
 *  precisely so "a later model tool write can never overwrite it" (this file's header). So the reconciliation is
 *  the ONE merge this domain already has — `applyLockedPatch(handState, turnColumns, handLocks)`, byte-identical
 *  in grammar to what the staging accumulator does per tool write. The human keeps every field they claimed; the
 *  turn keeps every field they did not.
 *
 *  IT RIDES `writeHandState`, WHICH IS WHY IT IS SAFE UNDER A SECOND EDIT. The fold derives INSIDE its own head
 *  resolve, so a hand edit that landed between the caller's arm check and this write is the base it folds onto
 *  (never a stale image), and one that lands after produces a strictly later rung that outranks the fold. The
 *  residual is the same single-continuation window the hand door has always had (ASSUMES(single-replica), as
 *  everywhere in this loop) — this adds no new one.
 *
 *  `slotSeq` is the flushing turn's own story position, and the fold is REFUSED for a hand row anywhere else:
 *  a hand row stamped further down the story belongs to later history, and folding an older turn's state into it
 *  would resurrect a past state into the present. */
export async function foldTurnWriteIntoHandHead(
  ctx: RpgContext,
  game: RpgGameRow,
  turnState: RpgSnapshotState,
  slotSeq: number,
): Promise<HandEditResult | null> {
  const head = await resolveSnapshotHead(ctx.db, { id: game.id, chatId: game.chatId });
  if (head === undefined || head.arm !== "hand" || head.seq !== slotSeq) {
    return null; // nothing shadows this flush's row (the ordinary path), or what does is not this slot's
  }
  return writeHandState(ctx, game, (hand) => ({
    ok: true,
    // The turn's STATE COLUMNS as the patch — never the whole state object, whose `fieldLocks` key would merge
    // the flush's (base-era) locks over the hand's freshly-minted ones and un-pin the very edit being protected.
    state: applyLockedPatch(
      hand.state as unknown as Record<string, unknown>,
      toColumns(turnState) as unknown as Record<string, unknown>,
      hand.locks,
    ) as unknown as RpgSnapshotState,
  }));
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
