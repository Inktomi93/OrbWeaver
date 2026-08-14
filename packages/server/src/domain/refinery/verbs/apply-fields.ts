// verb: applyFields — the SHARP END (security pass §4.8-13, in order): the user-accepted entries of the
// chosen rewrite run (latest, or the §16.1 operate-back `rewriteRunId`) land on the LIVE card. Per-entry
// salvage, never a whole-payload refusal — every dropped entry is itemized with its typed reason (the
// client renders them; nothing silently coerces or falls through to a different field).
//
// THE BELTS LIVE IN ONE PLACE — `substrate/accept-belts.ts` (intersection 9-11 + the §21 divergence
// check + the patch construction), SHARED verbatim with `applyAsCopy` so the branch-off arm can never
// drift a belt. This verb owns only what is merge-specific: the snapshot-first reversibility belt, the
// ONE canon write, the session completed-flip, and the greeting-removal selection remap.
//
// THE RE-PARSE IS THE INTERNAL-BOUNDARY BELT (belt 12, §3.A): the injected `character.update` op carries
// NO runtime validation (the wire zod parse lives at tRPC, which this server-internal call never
// crosses), so the constructed patch runs `updateCharacterSchema.parse` HERE — the
// `domain/import/substrate/card.ts:192` precedent. Do not "simplify" it away.
//
// SNAPSHOT FIRST (belt 13): `character.snapshot("auto: before refinery apply · <sessionId>")` — the
// label carries the SESSION id (schema-renderer §6.2's classification convention: the version walk
// classifies snapshots by prefix + session), and the minted snapshot id rides the RESULT (§16.2's
// widening) as the immediate rollback-point affordance.

import { updateCharacterSchema } from "@orb/contracts/character";
import { refinerySessions } from "@orb/db";
import type { RefinerySessionId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { buildPatch, remapSelection, resolveApplyBasis } from "../substrate/accept-belts.ts";

/** The pre-apply snapshot label — prefix-classified by the version walk (Refinery vs Manual vs
 *  Pre-restore), with the session id as the provenance suffix (§6.2's convention; label is free text and
 *  D28 forbids an FK either direction). */
const APPLY_SNAPSHOT_LABEL_PREFIX = "auto: before refinery apply";
function applySnapshotLabelOf(sessionId: RefinerySessionId): string {
  return `${APPLY_SNAPSHOT_LABEL_PREFIX} · ${sessionId}`;
}

export function createApplyFields(ctx: RefineryContext): RefineryService["applyFields"] {
  return async ({ principal, sessionId, accepts, rewriteRunId }) => {
    const ownerId = principal.userId;
    // The shared preamble: owned session → chosen rewrite (latest or operate-back) → LIVE card → the
    // per-entry intersection (belts 9-11 + divergence), in itemized order — ONE resolver with the copy arm.
    const { session, liveCard, applied, dropped, chosen } = await resolveApplyBasis(ctx, { ownerId, sessionId, rewriteRunId, accepts });
    if (chosen.length === 0) {
      // Nothing survived the belts — an honest ZERO-WRITE result (the client renders the drops): no
      // snapshot (snapshotId null, stated in the surface copy), no update, just the current detail.
      const detail = await ctx.getCharacter({ principal, characterId: session.characterId });
      return { applied, dropped, character: detail, snapshotId: null };
    }

    const { patch, removedGreetingIndexes } = buildPatch(liveCard, chosen);
    // Belt 12 — the internal-boundary re-parse (header). A patch this belt refuses is OUR defect (the
    // payload caps mirror the card caps by contract), so a throw here is loud, never itemized away.
    const input = updateCharacterSchema.parse(patch);

    // Belt 13 — snapshot first, then the ONE canon write (both through the injected character ops).
    const snapshot = await ctx.snapshotCharacter({ principal, characterId: session.characterId, label: applySnapshotLabelOf(sessionId) });
    const detail = await ctx.updateCharacter({ principal, characterId: session.characterId, input });

    // An apply completes the session (a later run/iterate flips it back active — a label, not a lock), and
    // a greeting removal REMAPS the selection in the same write: the session speaks in positions, so an
    // un-remapped index would silently re-point at a different greeting.
    await ctx.db
      .update(refinerySessions)
      .set({
        status: "completed",
        updatedAt: ctx.now(),
        ...(removedGreetingIndexes.length === 0 ? {} : { selection: remapSelection(session.selection, removedGreetingIndexes) }),
      })
      .where(eq(refinerySessions.id, sessionId));
    // The REFINERY half only. The card half already fanned `charactersChanged` inside the injected
    // `character.update` (one event per surface — re-emitting it here is the double-invalidate storm), and
    // the zero-write arm above returns BEFORE this line because it moved no row at all.
    ctx.emitUserEvent(ownerId, { type: "refineryChanged", sessionId });
    return { applied, dropped, character: detail, snapshotId: snapshot.id };
  };
}
