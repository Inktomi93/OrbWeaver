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
// widening) as the immediate rollback-point affordance. RETRACTED ON REFUSAL (#1551): the snapshot is the
// belt-14 write's WITNESS, not its prelude, so a `CHARACTER_STALE_BASIS` refusal deletes exactly that row
// before re-throwing — see the catch around `ctx.updateCharacter` below.

import type { CharacterCard } from "@orb/contracts/character";
import { CHARACTER_STALE_BASIS_OP_CODE, updateCharacterSchema } from "@orb/contracts/character";
import type { RefinableField } from "@orb/contracts/refinery";
import { refinerySessions } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { RefinerySessionId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { CardWriteBasis } from "#domain/character";
import type { CardIdentityField } from "#kit/serde/card";
import { cardContentHash } from "#kit/serde/card";
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

/** Every refinable field the card's identity hash CANNOT witness. Today: `creatorNotes` alone — it is
 *  refinable (`REFINABLE_FIELDS`) and deliberately outside `CARD_IDENTITY_FIELDS`, because re-attributing a
 *  card must not change what it IS. Both rulings stand; this type is where they MEET. */
type UnwitnessedRefinableField = Exclude<RefinableField, CardIdentityField>;

/** The basis belt 14 fences on: the identity hash PLUS every field this verb can write that the hash does
 *  not cover (#1560 — a hash-only fence let a creator-notes-only edit through and overwrote it, the same
 *  defect for one field in nine).
 *
 *  THE `satisfies` IS THE ENFORCER, not decoration: a tenth refinable field added outside the identity set
 *  widens {@link UnwitnessedRefinableField}, and this literal stops compiling until it (and
 *  `CardWriteBasis`, which the write predicate reads) carries it. That is the only reason the exclusion set
 *  is a tuple rather than an object literal in `#kit/serde/card`.
 *
 *  The hash itself is recomputed from the SAME projection the character row stores, so it equals
 *  `characters.content_hash` exactly; a flag/handle-only edit does not move it and correctly does not fence
 *  this write. */
function basisOf(liveCard: CharacterCard): CardWriteBasis {
  return { contentHash: cardContentHash(liveCard), creatorNotes: liveCard.creatorNotes } satisfies CardWriteBasis & {
    [K in UnwitnessedRefinableField]: CharacterCard[K];
  };
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
    //
    // BELT 14 — THE BASIS FENCE (#1446). Every concrete value in `input` was computed from `liveCard`, which
    // was read at `resolveApplyBasis` and is by construction OLD: a snapshot write sits between, and the user
    // reached this verb after reading a rendered diff. A plain in-place update would silently overwrite an
    // edit that landed in that window, and the §21 divergence belt cannot see it (that belt compares against
    // the session's `original_card` pin from session start, not against the basis this patch was built on).
    // So the write is CONDITIONAL on the card still carrying what the patch was merged against, and a card
    // that moved refuses TOTALLY (`CHARACTER_STALE_BASIS`) — nothing is half-applied, the other edit stands,
    // and the user re-runs the apply against a fresh diff. See {@link basisOf} for WHAT is compared.
    const snapshot = await ctx.snapshotCharacter({ principal, characterId: session.characterId, label: applySnapshotLabelOf(sessionId) });
    let detail: Awaited<ReturnType<typeof ctx.updateCharacter>>;
    try {
      detail = await ctx.updateCharacter({ principal, characterId: session.characterId, input, expectedBasis: basisOf(liveCard) });
    } catch (err) {
      // #1551 — the snapshot above is the apply's WITNESS, not its prelude (the `restoreCardInPlace`
      // precedent's own words): it exists to record what the card looked like BEFORE THIS APPLY, so it has
      // to be taken while that state is still live, i.e. before the conditional write can refuse. A
      // `CHARACTER_STALE_BASIS` refusal means the write never happened — the snapshot it was taken FOR is
      // then a spurious "auto: before refinery apply" row with nothing behind it, so this retracts exactly
      // that row (by id, never a bulk delete) before re-throwing the SAME refusal the caller already
      // expects. Any OTHER error rides through unretracted — the header's other belts (12, background
      // unavailability) leave the card row untouched, so there is nothing to undo.
      if (err instanceof DomainOperationError && err.code === CHARACTER_STALE_BASIS_OP_CODE) {
        await ctx.deleteSnapshot({ ownerId, snapshotId: snapshot.id, characterId: session.characterId });
      }
      throw err;
    }

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
