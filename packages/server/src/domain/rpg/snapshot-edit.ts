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
//   • UNcommitted head (this turn's draft) ⇒ write IN PLACE on the live variant (swipe-consistent).
//   • COMMITTED head, OR a turnless game (no snapshot rows — the no-born-seed ruling) ⇒ CLONE FORWARD onto a
//     fresh narrator slot (`postNarratorMessage`), born committed. An in-place write on a committed snapshot
//     would corrupt a locked-in past (a checkpoint's frozen state, a past swipe) — so a committed head is
//     never mutated; play continues on the new variant. The turnless case is the same forward-write, off the
//     synthesized default state.
// It also homes the two STATE READERS every other surface projects from — `currentSnapshotState` (the head) and
// `snapshotStateBeforeSlot` (the state before a slot: the flush's write base + a regen turn's read base) — so
// "which snapshot am I reasoning from, and what does a game with no rows read?" is answered in ONE place.

import type { RpgFieldLocks, RpgSnapshotState } from "@orb/contracts/rpg";
import { rpgSnapshotStateSchema } from "@orb/contracts/rpg";
import type { MessageId, MessageVariantId, RpgSnapshotId } from "@orb/kit/ids";
import type { HandEditLocks, HandEditResult, HandStateHead, HandStateWrite, RpgContext, RpgGameRow } from "./contract/service";
import { snapshotRowToState } from "./contract/service";
import { insertSnapshot, resolveSnapshotBeforeSlot, resolveSnapshotForTurn, updateSnapshotState } from "./persistence/snapshots";
import { defaultSnapshotState } from "./substrate/default-state";
import { applyLockedPatch } from "./substrate/merge";

/** The current resolved snapshot head: either a real variant-keyed row (write in place if UNcommitted) or the
 *  turnless-game synthesized default (a fresh narrator slot must be minted to write it). `variant` is null iff
 *  turnless; `committed` says whether an in-place write would corrupt a locked-in past (⇒ clone forward). */
async function resolveHead(
  ctx: RpgContext,
  game: RpgGameRow,
): Promise<{
  variant: { snapshotId: RpgSnapshotId; messageId: MessageId; variantId: MessageVariantId } | null;
  committed: boolean;
  state: RpgSnapshotState;
  locks: RpgFieldLocks | null;
}> {
  const row = await resolveSnapshotForTurn(ctx.db, { id: game.id, chatId: game.chatId });
  if (row === undefined) {
    return { variant: null, committed: false, state: defaultSnapshotState(), locks: null };
  }
  return {
    variant: { snapshotId: row.id, messageId: row.messageId, variantId: row.variantId },
    committed: row.committed === 1,
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
    // Refused BEFORE the clone-forward's `postNarratorMessage` — a rejected edit leaves no blank anchor slot.
    return { ok: false, reason: parsed.error.message };
  }
  const nextLocks: RpgFieldLocks = { ...(head.locks ?? {}) };
  for (const path of locks.lock ?? []) {
    nextLocks[path] = true;
  }
  for (const path of locks.clear ?? []) {
    delete nextLocks[path];
  }
  if (head.variant !== null && !head.committed) {
    // In-place on the live UNcommitted variant (this turn's draft head — swipe-consistent).
    await updateSnapshotState(ctx.db, head.variant.variantId, { ...toColumns(nextState), fieldLocks: nextLocks });
    return { ok: true, snapshotId: head.variant.snapshotId };
  }
  // A COMMITTED head (or a turnless game) must NOT be edited in place — that would corrupt a locked-in past
  // (a checkpoint's frozen state, a past swipe). CLONE FORWARD onto a fresh narrator slot, born committed.
  // The slot is a silent STATE ANCHOR: its EMPTY body is dropped from the assembled prompt (the shape-stage
  // empty-row filter) and hidden by the client message list — so a hand edit never mints a blank "Group"
  // bubble that also pollutes the prompt, while the slot stays ladder-visible so its snapshot resolves.
  const posted = await ctx.postNarratorMessage(game.chatId, "");
  const snapshotId = ctx.ids.snapshot();
  await insertSnapshot(ctx.db, {
    id: snapshotId,
    gameId: game.id,
    messageId: posted.messageId,
    variantId: posted.variantId,
    ...toColumns(nextState),
    fieldLocks: nextLocks,
    committed: 1,
    createdAt: ctx.now(),
  });
  return { ok: true, snapshotId };
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
