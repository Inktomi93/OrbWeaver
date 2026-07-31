// domain/rpg/verbs/game/resync-from-story — resyncFromStory (crunchy-cluster §1.3). The HOST "re-derive from the
// story" escape hatch: on demand, re-read a DEEP story window and REBUILD/reconcile the tracked state (the
// alternative to hand-editing when the panel has drifted). This is a NEW HOST-PRINCIPAL MODEL-CALL SITE — the
// consent seam (the host is authorizing a model read of the canon), so the gate is load-bearing:
//
// HOST-ONLY, GATED AT THE WRITE/MODEL-CALL BOUNDARY (`resolveHost`). A member reaching this verb gets a
// leak-free NOT_FOUND (non-member) or FORBIDDEN (present non-host) BEFORE any model call — a member can NEVER
// trigger the host-principal model call (the principal-laundering hole [[chat-tools-execute-as-host]] /
// [[injected-op-caller-gate]] this gate closes). Authority is the SAME chat-FK-derived `getMembership` every
// rpg verb resolves through (no ownerId, D18/D20).
//
// THE PRINCIPAL: `resolveHost` confirms the CALLER's present role IS host, so `params.principal.userId` is the
// room host — that host userId (never a params-supplied id) funds the model call: the injected
// `runResyncExtraction` resolves the ROOM connection AS THE HOST and drives ONE structured-output rebuild. The
// consenting human is at the keyboard, so consent is the host's OWN (not a force-stamped inheritance from an
// unrelated turn) — the one sanctioned non-inherited rpg model call.
//
// DECEPTION SURFACE-ONLY (#7 rec A): the rebuild rides the SAME §1.6 extraction-prompt registry the in-turn
// round does, so a deception-active game composes the surface-only clause — the model never writes hidden
// `<lie>`/`<ofilter>` truth into a member-visible plane. The canon-window read (`resolveCanonWindow`) is
// model-plane (hidden spans intact, the model reads its own lies, D110 §3.6) — the member never sees it.
//
// THE TAIL: the reconciled delta merges onto the resolution-ladder base through `applyLockedPatch` (locks
// HONORED — a resync repairs the model plane, never the host's pins), and writes BORN COMMITTED onto a fresh
// silent state-anchor slot (§4.1 — an empty-content narrator slot, prompt-excluded + surface-hidden, never a
// blank bubble). An empty rebuild (capability-absent connection / no writes) is a no-op — no slot, no write.
//
// IDEMPOTENCE — THE RECONCILER LANDS THE RE-DERIVED TRUTH, IT NEVER APPENDS ONTO IT (VER-1a). The resync is
// the ONE verb a host fires repeatedly at an unchanged story, so "run it twice ⇒ the same state" is a
// contract, not a nicety. The turn vehicles' delta is APPEND-shaped on the two log planes, and inheriting
// that made every click grow the panel (live-confirmed: four resyncs left four paraphrases of ONE story beat
// in `recentEvents` and three near-identical journal rows). Both are re-shaped here, at the reconciler:
//   • recentEvents — REBUILT, not appended: the beats this pass re-derived REPLACE the window (the tail past
//     the base, `resyncStatePatch`). The window is a rolling projection of the story, so re-deriving it from
//     the story is exactly what "resync" means — and it is what collapses an already-duplicated window back
//     to one line (the host's one-click cleanup). A pass that re-derived NO beat leaves the window untouched.
//   • journal — NOT WRITTEN. The archive is an append-only, variant-stamped record of what the LIVE turns
//     produced; a resync re-reading the same story can only re-author beats already in it, and its anchor
//     slot carries no narrative to hang them on. Superseding its own prior entries would need a durable
//     "this row came from a resync" marker (no such column, and no-legacy forbids inventing one for the dev
//     db); dropping the write makes the plane idempotent by construction instead. A host repairing the
//     archive itself uses `addJournalEntry`/`editJournalEntry`/`deleteJournalEntry` (built, host-gated).

import type { RpgSnapshotState } from "@orb/contracts/rpg";
import type { ResyncFromStoryParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { snapshotRowToState } from "../../contract/service";
import { resolveHost } from "../../guard";
import { resolveSnapshotForTurn, writeResyncedSnapshot } from "../../persistence/snapshots";
import { defaultSnapshotState } from "../../substrate/default-state";
import { applyLockedPatch } from "../../substrate/merge";

/** The deep-window budget the resync reads (the deepest honest read — a const, NOT a client knob, so a caller
 *  can't inflate the read). Bounded for the sad-path 8B ([[plan-for-small-hardware]]); a resync is a rare
 *  host-initiated action, so a generous ceiling is affordable. */
const RPG_RESYNC_MAX_TOKENS = 16_384;

/** The silent state-anchor slot the resynced snapshot keys to (empty content ⇒ prompt-excluded + surface-hidden
 *  by construction — never a blank bubble; the §4.1 hand-edit/restore precedent). */
const RESYNC_ANCHOR_CONTENT = "";

/** The state-plane key whose vehicle semantics are APPEND (`applyUpdateScene` returns `[...base, beat]`) and
 *  whose reconciler semantics are REBUILD — the one plane {@link resyncStatePatch} re-shapes. */
const RECENT_EVENTS = "recentEvents";

/** Re-shape the rebuild's patch for the RECONCILER (the header's idempotence contract): `recentEvents` arrives
 *  as the append of this pass's beats onto the base window, so keep only the tail past the base — the window
 *  the resync REBUILT. A pass that re-derived no beat drops the key entirely (the window survives untouched);
 *  every other plane is already absolute and passes through. Pure — the caller re-checks emptiness after. */
function resyncStatePatch(baseState: RpgSnapshotState, statePatch: Record<string, unknown>): Record<string, unknown> {
  const appended = statePatch[RECENT_EVENTS];
  if (!Array.isArray(appended)) {
    return statePatch; // the rebuild touched no beat plane
  }
  const rebuilt = appended.slice(baseState.recentEvents.length);
  const { [RECENT_EVENTS]: _dropped, ...rest } = statePatch;
  return rebuilt.length === 0 ? rest : { ...rest, [RECENT_EVENTS]: rebuilt };
}

export function createResyncFromStory(ctx: RpgContext): Pick<RpgService, "resyncFromStory"> {
  async function resyncFromStory(params: ResyncFromStoryParams): Promise<void> {
    // HOST GATE at the model-call boundary — a member can never reach the host-principal model call.
    const { game } = await resolveHost(ctx, params.principal, params.chatId);
    // The caller IS the host (resolveHost enforced it), so the host principal funding the model call is the
    // caller's own userId — NEVER a params-supplied id (no foreign-principal injection).
    const hostUserId = params.principal.userId;

    // The resolution-ladder head the rebuild reconciles against (the same base the in-turn round reads).
    const baseRow = await resolveSnapshotForTurn(ctx.db, { id: game.id, chatId: game.chatId });
    const baseState = baseRow === undefined ? defaultSnapshotState() : snapshotRowToState(baseRow);

    // The DEEP story window (the injected chat op — rpg reads no chat table; hidden spans intact, model-plane).
    const transcript = await ctx.resolveCanonWindow(game.chatId, { maxTokens: RPG_RESYNC_MAX_TOKENS });

    // The host-principal model call: resolves the room connection AS THE HOST, establish-EVERYTHING rebuild over
    // the deep window. A capability-absent connection / empty rebuild returns an empty delta (a no-op resync).
    const delta = await ctx.runResyncExtraction({ chatId: game.chatId, hostUserId, baseState, transcript });
    // The RECONCILER re-shape (the header's idempotence contract): the beat window is REBUILT, not appended,
    // and the journal archive is not written at all — so a second click on an unchanged story is a no-op.
    const statePatch = resyncStatePatch(baseState, delta.statePatch);
    if (Object.keys(statePatch).length === 0) {
      return; // nothing rebuilt (readonly / model no-op) — no slot, no write (byte-identical non-writing action)
    }

    // Merge the delta onto the base — locks HONORED (a resync repairs the model plane, never a hand-pin).
    const nextState = applyLockedPatch(baseState as unknown as Record<string, unknown>, statePatch, baseState.fieldLocks) as unknown as RpgSnapshotState;

    // Mint the fresh silent state-anchor slot; write the reconciled state BORN COMMITTED onto it.
    const posted = await ctx.postNarratorMessage(game.chatId, RESYNC_ANCHOR_CONTENT);
    const snapshotId = ctx.ids.snapshot();
    const written = await writeResyncedSnapshot(ctx.db, nextState, {
      id: snapshotId,
      gameId: game.id,
      messageId: posted.messageId,
      variantId: posted.variantId,
      now: ctx.now(),
    });
    if (!written.ok) {
      // The F1 backstop refused a contract-invalid rebuild — drop the whole resync (no journal, no emits), and
      // SURFACE it (never a silent vanish — the same observability contract the flush's drop honors).
      ctx.onFlushDropped({ chatId: game.chatId, gameId: game.id, variantId: posted.variantId, reason: written.reason });
      return;
    }

    // NO journal write (the header's idempotence contract) — `delta.journal` is deliberately unread here, so
    // no `journalChanged` either: the archive is untouched by a rebuild.

    // The resynced snapshot is the new resolved-current head → the whole panel re-resolves (§4.9).
    ctx.emitBus({ type: "snapshotPatched", chatId: game.chatId, snapshotId });
  }
  return { resyncFromStory };
}
