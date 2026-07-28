// domain/rpg/snapshot-edit — the shared hand-edit machinery over the CURRENT resolved snapshot (rpg-design/05
// §4.4). A domain-root I/O-wrapping helper (the `turn-staging.ts`/`guard.ts` I/O-root precedent — it awaits
// the db + can't live in zero-I/O `substrate/`, and verb-to-verb VALUE imports are banned).
// editSnapshot / upsertQuest / deleteQuest all write the swipe-volatile plane by hand; they share ONE
// mechanism: resolve the current snapshot (the resolution-ladder head), overlay the patch (hand-always-wins),
// AUTO-LOCK every touched field (manual-edit-wins — a later model tool write can never overwrite it), and
// persist. TWO write targets by head state:
//   • UNcommitted head (this turn's draft) ⇒ write IN PLACE on the live variant (swipe-consistent).
//   • COMMITTED head, OR a turnless game (no snapshot rows — the no-born-seed ruling) ⇒ CLONE FORWARD onto a
//     fresh narrator slot (`postNarratorMessage`), born committed. An in-place write on a committed snapshot
//     would corrupt a locked-in past (a checkpoint's frozen state, a past swipe) — so a committed head is
//     never mutated; play continues on the new variant. The turnless case is the same forward-write, off the
//     synthesized default state.

import type { RpgFieldLocks, RpgSnapshotState } from "@orb/contracts/rpg";
import type { MessageId, MessageVariantId, RpgSnapshotId } from "@orb/kit/ids";
import type { HandEditLocks, RpgContext, RpgGameRow } from "./contract/service";
import { snapshotRowToState } from "./contract/service";
import { insertSnapshot, resolveSnapshotForTurn, updateSnapshotState } from "./persistence/snapshots";
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
  "clock" | "calendarDate" | "location" | "weather" | "presentCharacters" | "recentEvents" | "actorState" | "widgetValues" | "quests" | "plot"
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
    widgetValues: state.widgetValues,
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
 *  state. The [merge-clear] contract still governs the overlay shape (`{}` = no-op, null = leaf clear). */
export async function applyHandEdit(ctx: RpgContext, game: RpgGameRow, patch: Record<string, unknown>, locks: HandEditLocks = {}): Promise<RpgSnapshotId> {
  const head = await resolveHead(ctx, game);
  const nextState = applyLockedPatch(head.state as unknown as Record<string, unknown>, patch, null) as unknown as RpgSnapshotState;
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
    return head.variant.snapshotId;
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
  return snapshotId;
}

/** The current resolved snapshot state (a read the tracker view + the quest verbs project from). For a turnless
 *  game (no snapshot rows) this is the synthesized default steady-state (the orchestrator no-born-seed ruling). */
export async function currentSnapshotState(ctx: RpgContext, game: RpgGameRow): Promise<RpgSnapshotState> {
  return (await resolveHead(ctx, game)).state;
}
