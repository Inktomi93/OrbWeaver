// domain/rpg/snapshot-edit — the shared hand-edit machinery over the CURRENT resolved snapshot (D58
// §4.4). A domain-root I/O-wrapping helper (the `guard.ts` I/O-root precedent — it awaits
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
// THE THIRD DOOR IS THE FLUSH'S: `commitTurnWrite` is a turn's write boundary. It writes the turn's row and
// reconciles it with whatever outranks it inside the same per-game section the hand doors use, so a turn write, a
// second turn write and a hand write never interleave. Reconciling with a HAND ROW is `writeHandState` again,
// replaying the turn's patches under the hand's locks: a mid-flight hand edit keeps every field it locked (that is
// what the auto-lock above MEANS), and the turn keeps every plane the hand did not claim.
//
// WHICH LATER BEAT SUPERSEDES A TURN (the turn-kind rule, `OPENS_TAIL_SLOT`). A head past a turn's own beat is
// either the story having moved on before the turn began, or a turn that arrived while it ran:
//   • `send`, `generate`, `auto`, `force`, `opening` and `impersonate` open a NEW slot at the tail, so every
//     later beat arrived while they ran. Their state goes UNDER the later beat's change; what the later beat
//     replaced is recorded on the turn's tool-call row, never dropped in silence.
//   • `swipe` and `continue` target an EXISTING slot. They regenerate an older message, and stay silently
//     superseded, exactly when a visible assistant slot after theirs already existed when their round read its
//     base (`tailSeqAtBase`). The variant's age cannot answer this: a continue extends a variant older than
//     every later slot. A later slot that arrived after the base read is concurrent, as above.
// A turn whose base moved while its round ran (an earlier beat's row landed under it) is replayed onto the new
// base before its row is written, so the earlier beat's writes stay under it.
//
// It also homes the two STATE READERS every other surface projects from — `currentSnapshotState` (the head) and
// `snapshotStateBeforeSlot` (the state before a slot: the flush's write base + a regen turn's read base) — so
// "which snapshot am I reasoning from, and what does a game with no rows read?" is answered in ONE place.

import type { TurnKind } from "@orb/contracts/chat";
import type { RpgFieldLocks, RpgSnapshotState } from "@orb/contracts/rpg";
import { rpgSnapshotStateSchema } from "@orb/contracts/rpg";
import type { MessageId, MessageVariantId, RpgGameId, RpgSnapshotId } from "@orb/kit/ids";
import type { StagedPatch } from "./contract/params.ts";
import type {
  HandEditLocks,
  HandEditResult,
  HandStateHead,
  HandStateWrite,
  OwnedRpgHandWrites,
  RpgAuthorized,
  RpgContext,
  RpgGameRow,
  TurnWriteFoldOutcome,
  TurnWriteInput,
  TurnWriteOutcome,
} from "./contract/service.ts";
import { snapshotRowToState } from "./contract/service.ts";
import {
  findLatestAssistantSlotSeq,
  findMessageSeq,
  resolveSnapshotBeforeSlot,
  resolveSnapshotHead,
  updateSnapshotState,
  writeHandSnapshot,
  writeStagedSnapshotAndJournal,
} from "./persistence/snapshots.ts";
import { defaultSnapshotState } from "./substrate/default-state.ts";
import { applyLockedPatch, applyLockedPatchTracked, netChange, rebasePatchOntoHead, replacedWritePaths, sameSnapshotState } from "./substrate/merge.ts";

/** The game a hand write lands on and chat's admission of its room, which the write's claim spends. */
type HandWriteRoom = Pick<RpgAuthorized, "game" | "admission">;

/** The `committed` column's draft value — an UNcommitted TURN row is the only in-place-editable head. */
const UNCOMMITTED = 0;

/** Per-game read-modify-write ownership for one graph (D130's single-replica reconciliation).
 * A caller receives its rejection; only the settlement tail absorbs it to release the next writer.
 */
export function createRpgHandWrites(): OwnedRpgHandWrites {
  const chains = new Map<RpgGameId, Promise<void>>();
  let closed = false;
  return {
    run<T>(gameId: RpgGameId, job: () => Promise<T>): Promise<T> {
      if (closed) {
        return Promise.reject(new Error("RPG hand writes are closed"));
      }
      const previous = chains.get(gameId) ?? Promise.resolve();
      const next = previous.then(job);
      const settled = next.then(
        () => undefined,
        () => undefined,
      );
      const tail = settled.finally(() => {
        if (chains.get(gameId) === tail) {
          chains.delete(gameId);
        }
      });
      chains.set(gameId, tail);
      return next;
    },
    async [Symbol.asyncDispose](): Promise<void> {
      closed = true;
      await Promise.all(chains.values());
    },
  };
}

/** The current resolved snapshot head, plus the ONE question the write tail asks of it: may this row be
 *  edited IN PLACE? `inPlace` is non-null ONLY for an UNCOMMITTED TURN row that is the ladder's own TURN RUNG
 *  (this turn's own draft) — a committed row is a locked-in past, a HAND row is born committed, and a turnless
 *  game has no row at all; all three clone forward as a new hand row.
 *
 *  THE ARM CHECK IS THE FIX, NOT A BELT. "Uncommitted turn row" alone does
 *  NOT mean "this turn's draft", and the gap is reachable in ordinary play: while a turn's post-commit state
 *  round is in flight its slot has NO snapshot yet (that is what in-flight means), so the ladder's turn arm
 *  comes back empty and the game-wide `fallback` walk answers with the PREVIOUS speaker's still-uncommitted
 *  draft — a row at an EARLIER slot. Editing that in place put the host's edit on a row the in-flight flush's
 *  own row then strictly outranked, and the edit vanished silently, auto-lock and all (a group round is the
 *  live shape: two assistants speak back-to-back, so no `onUserCommit` has locked the first row in).
 *
 *  THE `turn` ARM ALONE NO LONGER CARRIES THAT MEANING, AND THE SEQ CHECK RESTORES IT.
 *  Reading "`arm === "turn"`" as "this row is at the ladder's TIP" is true only
 *  because the turn arm inspected exactly ONE slot: an in-flight flush made it go dark, and the earlier row came
 *  back wearing `fallback`. The turn arm now WALKS DOWN the selected lineage (`persistence/snapshots.ts`), so
 *  that very same earlier uncommitted draft comes back wearing `turn` — which would silently reopen the
 *  same loss. The tip test is therefore made EXPLICIT rather than inferred from the arm: the head must sit
 *  at the story's CURRENT beat. `findLatestAssistantSlotSeq` is the same "which beat is the story on" reader the
 *  flush's fold uses, so the two cannot disagree about the tip. */
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
  const atCurrentBeat = head.seq === (await findLatestAssistantSlotSeq(ctx.db, game.chatId));
  return {
    inPlace:
      head.arm === "turn" && atCurrentBeat && row.variantId !== null && row.committed === UNCOMMITTED ? { snapshotId: row.id, variantId: row.variantId } : null,
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
 *  quest verbs lock `quests.<id>`), `locks.clear` are paths to un-lock (a removal drops the removed element's
 *  lock — a deleted element leaves no ghost lock, the symmetric grammar). The hand edit ALWAYS WINS: the
 *  overlay runs with NO lock-honoring (`fieldLocks: null`), because the human editor is the authority a lock
 *  exists to protect — a lock blocks a later TOOL write, never the human re-editing/removing their own locked
 *  field (that would trap the host). The lock delta is applied to the existing locks and written with the
 *  state. The [merge-clear] contract still governs the overlay shape (`{}` = no-op, null = leaf clear).
 *
 *  THE F1 WRITE-BOUNDARY BACKSTOP APPLIES HERE TOO (D108's "canon never corrupted is STRUCTURAL"): the merged
 *  state is validated against the full contract schema BEFORE any durable write, exactly as `writeStagedSnapshotAndJournal`
 *  validates the model path. The hand path reaches the same columns with a caller-shaped overlay, so it can
 *  produce the same poison — a `null` cleared onto a NON-nullable leaf (`location`, the arrays, the records)
 *  is the reachable case, and the merge-clear contract is right to write it: it is the CONTRACT, not the merge,
 *  that says which leaves clear. The refusal returns as data (never a wire reject — `inputs.ts`) and nothing is
 *  written, so the caller learns WHY instead of watching a value snap back. */
export function applyHandEdit(ctx: RpgContext, room: HandWriteRoom, patch: Record<string, unknown>, locks: HandEditLocks = {}): Promise<HandEditResult> {
  return writeHandState(ctx, room, (head) => ({
    ok: true,
    state: applyLockedPatch(head.state, patch, null),
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
export function writeHandState(ctx: RpgContext, room: HandWriteRoom, derive: (head: HandStateHead) => HandStateWrite): Promise<HandEditResult> {
  return ctx.handWrites.run(room.game.id, () => writeOwnedHandState(ctx, room, derive));
}

/** The owned body of {@link writeHandState}. Ownership spans head resolution through the durable write: moving
 *  either side outside the callback reopens the same-head race this boundary exists to close. */
async function writeOwnedHandState(ctx: RpgContext, room: HandWriteRoom, derive: (head: HandStateHead) => HandStateWrite): Promise<HandEditResult> {
  const { game, admission } = room;
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
  const lockedPaths = new Map(Object.entries(head.locks ?? {}));
  for (const path of locks.lock ?? []) {
    lockedPaths.set(path, true);
  }
  for (const path of locks.clear ?? []) {
    lockedPaths.delete(path);
  }
  const nextLocks: RpgFieldLocks = Object.fromEntries(lockedPaths);
  // A hand write is an explicit host write and claims the room (D166): here, after the derive and parse
  // refusals above and before the durable write, so every hand door claims in the same place.
  const claim = await ctx.claimChat(admission);
  if (head.inPlace !== null) {
    // In-place on the live UNcommitted variant (this turn's draft head — swipe-consistent).
    await updateSnapshotState(ctx.db, claim, head.inPlace.variantId, { ...toColumns(nextState), fieldLocks: nextLocks });
    return { ok: true, snapshotId: head.inPlace.snapshotId };
  }
  // A COMMITTED head, a HAND-row head, or a turnless game must NOT be edited in place — that would corrupt a
  // locked-in past (a checkpoint's frozen state, a past swipe). CLONE FORWARD as a new HAND ROW (D124): no
  // message posted, no variant, ordered by the chat's tail slot. Nothing lands on the message plane at all.
  const snapshotId = ctx.ids.snapshot();
  await writeHandSnapshot(ctx.db, claim, { state: nextState, fieldLocks: nextLocks }, { id: snapshotId, gameId: game.id, chatId: game.chatId, now: ctx.now() });
  return { ok: true, snapshotId };
}

/** The base a turn's round reads and its row is composed on. A continuation's canon and reminder INCLUDE the
 *  selected slot, and its variant is extended in place, so it reads the current head. Every other turn writes a
 *  new variant and must exclude its own slot (VER-1a), especially a swipe whose rejected sibling already has
 *  consequences. This mirrors the gather's `regenSlotMessageId` fork, so what the model was told and what its
 *  writes land on stay identical. The flush reads it before the round and the write boundary reads it again. */
export function turnBaseState(ctx: RpgContext, game: RpgGameRow, turn: Pick<TurnWriteInput["turn"], "kind" | "messageId">): Promise<RpgSnapshotState> {
  return turn.kind === "continue" ? currentSnapshotState(ctx, game) : snapshotStateBeforeSlot(ctx, game, turn.messageId);
}

/** Does a turn of this kind write a NEW slot at the story's tail? Only such a turn can be overtaken by a later
 *  beat; a swipe or continue targets an existing slot, which may sit anywhere in the story. */
const OPENS_TAIL_SLOT: Readonly<Record<TurnKind, boolean>> = {
  send: true,
  generate: true,
  auto: true,
  force: true,
  opening: true,
  impersonate: true,
  swipe: false,
  continue: false,
};

/** THE TURN WRITE BOUNDARY: write a taken flush's row and journal, then reconcile the row against whatever
 *  outranks it, as ONE section of the per-game hand-write owner. Always returns a TOTAL {@link TurnWriteOutcome}.
 *
 *  WHY THE WRITE ITSELF IS INSIDE THE SECTION. A turn reads its base at flush start and its round then runs a
 *  model call. Two turns of one game whose rounds overlap (a lock-free generate beside a send, or a flush past the
 *  barrier's bound) used to lose one turn's writes in either release order: the later turn's row landed first and
 *  the earlier turn's fold took it for a regen, or the earlier row landed first and the later turn wrote a row
 *  composed on the base it read before that, erasing it. Inside one section each question is asked against rows
 *  no other turn write or hand write can move until the answer is written:
 *    • the base is re-read; when an earlier beat's row landed under the round, the round's patches are replayed
 *      onto it ({@link composeOnCurrentBase}) before the row is written;
 *    • a later concurrent beat that already outranks the row gets this turn's state under its own change.
 *  The section awaits only database reads and writes and the claim, never a provider call, so a stuck turn
 *  cannot hold another turn's write behind it. */
export function commitTurnWrite(ctx: RpgContext, room: HandWriteRoom, input: TurnWriteInput): Promise<TurnWriteOutcome> {
  return ctx.handWrites.run(room.game.id, () => commitOwnedTurnWrite(ctx, room, input));
}

/** The owned body of {@link commitTurnWrite}. It calls the un-serialized halves (`writeOwnedHandState`) because
 *  the chain is not re-entrant: a nested `writeHandState` would wait on a tail only this call can settle. */
async function commitOwnedTurnWrite(ctx: RpgContext, room: HandWriteRoom, input: TurnWriteInput): Promise<TurnWriteOutcome> {
  const composed = await composeOnCurrentBase(ctx, room.game, input);
  const written = await writeStagedSnapshotAndJournal(ctx.db, composed.state, input.target, input.journal);
  if (!written.ok) {
    return { kind: "dropped", reason: written.reason };
  }
  const seq = await findMessageSeq(ctx.db, input.turn.messageId);
  // A racing delete took this turn's slot: there is no position to reconcile at.
  const fold: TurnWriteFoldOutcome =
    seq === undefined
      ? { kind: "head", headId: written.row.id }
      : await foldOwnedTurnWrite(ctx, room, { ...composed, patches: input.flush.patches, snapshotId: written.row.id }, { seq, turn: input.turn });
  return { kind: "written", fold, suppressedByLocks: composed.suppressed };
}

/** The state this turn's row carries, composed on the base as it stands NOW. The ordinary case is the
 *  accumulator's own state. When the base reader answers differently from the seed the round read, an earlier
 *  beat's row landed while the round ran, and the row is rebuilt by replaying the round's patches onto it: the
 *  later beat's writes win where both wrote, as they would have in sequence. */
async function composeOnCurrentBase(
  ctx: RpgContext,
  game: RpgGameRow,
  input: TurnWriteInput,
): Promise<{ readonly seed: RpgSnapshotState; readonly state: RpgSnapshotState; readonly suppressed: readonly string[] }> {
  const { flush } = input;
  const base = await turnBaseState(ctx, game, input.turn);
  if (sameSnapshotState(base, flush.seed)) {
    return { seed: flush.seed, state: flush.state, suppressed: flush.suppressedByLocks };
  }
  return { seed: base, ...replayPatches(base, flush.patches, base.fieldLocks) };
}

/** Replay a turn's staged patches onto `start` in STAGE ORDER, against `locks` — the identical composition the
 *  accumulator performed over its seed, differing only in the state it starts from and whose locks arbitrate.
 *
 *  REBASED FIRST: every applier in `tools/apply.ts` composes WHOLE PLANES from the base it was handed, so a
 *  staged patch is not a delta — a round that merely mentions the scene carries every on-stage actor in it.
 *  Replaying that verbatim re-inserted an actor the host had dismissed mid-flight, silently, because the removal
 *  verbs release the very lock that would have stopped it. The rebase keeps what the round ADDED, CHANGED or
 *  REMOVED and drops what it merely CARRIED (`substrate/merge.ts`).
 *
 *  EACH ENTRY AGAINST ITS OWN BASE: a turn stages once per tool call, and patch N was composed against
 *  `seed + patches[0..N-1]`. Measuring every patch against the SEED re-scored an element patch 1 had already
 *  added as a fresh ADD for patch 2 and appended it a second time. The pairing is carried by the accumulator
 *  (`StagedPatch`), so the invariant is local and the replay is a pure function of the stored patches. */
function replayPatches(
  start: RpgSnapshotState,
  patches: readonly StagedPatch[],
  locks: RpgFieldLocks | null,
): { readonly state: RpgSnapshotState; readonly suppressed: readonly string[] } {
  const suppressed: string[] = [];
  let state = start;
  for (const staged of patches) {
    const merged = applyLockedPatchTracked(state, rebasePatchOntoHead(staged.patch, staged.base, state), locks);
    state = merged.state;
    for (const path of merged.suppressed) {
      if (!suppressed.includes(path)) {
        suppressed.push(path);
      }
    }
  }
  return { state, suppressed };
}

/** What the reconcile needs of the row just written: its id, the state it carries, the base that state was
 *  composed on, and the patches that composed it. */
interface WrittenTurnRow {
  readonly snapshotId: RpgSnapshotId;
  readonly seed: RpgSnapshotState;
  readonly state: RpgSnapshotState;
  readonly patches: readonly StagedPatch[];
}

/** RECONCILE a just-written turn row with the row that outranks it — the write-boundary half of the
 *  HAND-EDIT-VS-FLUSH fix and of the REGEN-VS-LATER-FLUSH fix. Runs INSIDE the per-game section.
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
 *  IT REPLAYS THE PATCHES, NEVER THE COMPOSED STATE. The turn's
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
 *  A NEWER HAND HEAD IS STILL FOLDED INTO. If the user sends their next
 *  message mid-flight and then steers, the hand row lands one beat DOWN the story and the earlier shape bailed
 *  out silently, erasing the turn's writes with no trail at all. The state planes are cumulative and the
 *  round's patches are the newest MODEL knowledge regardless of which beat produced them, so replaying them
 *  onto the newer hand head is right — and the human's locks arbitrate exactly as they do at the same beat.
 *
 *  A LATER CONCURRENT BEAT IS COMPOSED OVER, NOT SKIPPED. A head past this turn's beat is one of two things,
 *  and the file header's turn-kind rule tells them apart. A REGEN of an old message is superseded by the beats
 *  after it by design, so it stays silent: injecting an old beat's consequences into the present would be the
 *  resurrection bug wearing the fix's clothes. A later turn that arrived while this round ran is the next beat
 *  of the same story, so this turn's state goes UNDER the later head's change ({@link composeUnderLaterBeat}),
 *  and every path of this turn the later beat replaced is returned for the turn's tool-call record. */
async function foldOwnedTurnWrite(
  ctx: RpgContext,
  room: HandWriteRoom,
  written: WrittenTurnRow,
  at: { readonly seq: number; readonly turn: TurnWriteInput["turn"] },
): Promise<TurnWriteFoldOutcome> {
  const { game } = room;
  const head = await resolveSnapshotHead(ctx.db, { id: game.id, chatId: game.chatId });
  if (head === undefined || head.row.id === written.snapshotId) {
    // We ARE head (the ordinary flush). `undefined` is unreachable in practice — we just inserted a row — but
    // it resolves to the same answer, so it needs no branch of its own.
    return { kind: "head", headId: written.snapshotId };
  }
  const currentBeat = await findLatestAssistantSlotSeq(ctx.db, game.chatId);
  if (currentBeat !== undefined && currentBeat > at.seq) {
    const regen = !OPENS_TAIL_SLOT[at.turn.kind] && at.turn.tailSeqAtBase !== undefined && at.turn.tailSeqAtBase > at.seq;
    return regen ? { kind: "head", headId: head.row.id } : composeUnderLaterBeat(ctx, room, written, head.row.id);
  }
  if (head.arm !== "hand") {
    // A non-hand row outranks us AT OUR OWN BEAT: a sibling variant selected by a mid-flight swipe, or the
    // game-wide fallback answering. There is no hand gesture to reconcile against and no defensible merge —
    // but the turn's writes ARE lost, so the caller says so.
    return { kind: "shadowed", headId: head.row.id, reason: `the ${head.arm} row ${head.row.id} outranks this flush's row at seq ${head.seq}` };
  }
  // What the HAND HEAD's locks drop out of this replay — collected at the merge and returned to the flush,
  // which puts it on the turn's tool-call record. The human keeps their field either way; the trail is what
  // stops the record from claiming the model's write landed.
  let suppressed: readonly string[] = [];
  const folded = await writeOwnedHandState(ctx, room, (hand) => {
    const replayed = replayPatches(hand.state, written.patches, hand.locks);
    suppressed = replayed.suppressed;
    return { ok: true, state: replayed.state };
  });
  return folded.ok
    ? { kind: "folded", headId: folded.snapshotId, suppressed, superseded: [] }
    : { kind: "refused", headId: head.row.id, reason: folded.reason };
}

/** Put this turn's state UNDER a later concurrent beat's row: this turn's composed state first, then the later
 *  head's change relative to the base this turn read, so the later beat wins wherever both wrote, exactly as two
 *  turns in sequence would. The later head was composed on that same base: its row landed while this one was
 *  unwritten, and the section re-read its base before writing it. An element both wrote is the later beat's
 *  whole, so a field only this turn changed on it is replaced too, and recorded as such. Written onto the later
 *  head through the hand door's tail (in place on its uncommitted draft), with no lock added. */
async function composeUnderLaterBeat(ctx: RpgContext, room: HandWriteRoom, written: WrittenTurnRow, laterId: RpgSnapshotId): Promise<TurnWriteFoldOutcome> {
  let superseded: readonly string[] = [];
  const folded = await writeOwnedHandState(ctx, room, (later) => {
    const state = applyLockedPatch(written.state, rebasePatchOntoHead(netChange(written.seed, later.state), written.seed, written.state), null);
    superseded = replacedWritePaths(written.seed, written.state, state);
    return { ok: true, state };
  });
  return folded.ok ? { kind: "folded", headId: folded.snapshotId, suppressed: [], superseded } : { kind: "refused", headId: laterId, reason: folded.reason };
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
