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

import type { RpgSnapshotState } from "@orb/contracts/rpg";
import { rpgJournalTypeSchema } from "@orb/contracts/rpg";
import type { ResyncFromStoryParams } from "../../contract/params";
import type { RpgContext, RpgService } from "../../contract/service";
import { snapshotRowToState } from "../../contract/service";
import { resolveHost } from "../../guard";
import { insertJournalEntry } from "../../persistence/journal";
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
    const hasStatePatch = Object.keys(delta.statePatch).length > 0;
    if (!hasStatePatch && delta.journal.length === 0) {
      return; // nothing rebuilt (readonly / model no-op) — no slot, no write (byte-identical non-writing action)
    }

    // Merge the delta onto the base — locks HONORED (a resync repairs the model plane, never a hand-pin).
    const nextState: RpgSnapshotState = hasStatePatch
      ? (applyLockedPatch(baseState as unknown as Record<string, unknown>, delta.statePatch, baseState.fieldLocks) as unknown as RpgSnapshotState)
      : baseState;

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

    // The rebuilt journal entries stamp the anchor slot's committed variant (the model-entry lineage stamp).
    await Promise.all(
      delta.journal.map((entry) =>
        insertJournalEntry(ctx.db, {
          id: ctx.ids.journal(),
          gameId: game.id,
          type: rpgJournalTypeSchema.parse(entry.type),
          title: entry.title,
          content: entry.content,
          variantId: posted.variantId,
          sourceMessageId: posted.messageId,
          createdAt: ctx.now(),
        }),
      ),
    );

    // The resynced snapshot is the new resolved-current head → the whole panel re-resolves (§4.9).
    ctx.emitBus({ type: "snapshotPatched", chatId: game.chatId, snapshotId });
    if (delta.journal.length > 0) {
      ctx.emitBus({ type: "journalChanged", chatId: game.chatId });
    }
  }
  return { resyncFromStory };
}
