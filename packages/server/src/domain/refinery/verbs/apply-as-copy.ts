// verb: applyAsCopy — the BRANCH-OFF terminal act (schema-renderer §17; the git model's "branch off
// instead of merging"): the SAME reviewed accept set through the SAME belts (`substrate/accept-belts` —
// intersection 9-11 + divergence, verbatim), but the write arm mints a NEW character instead of touching
// the live one. Chassis = the injected `character.duplicate` (what a duplicate carries — avatar ref,
// theme policies, attached-book references — FOLLOWS that verb's own rulings; one fork-copy law, not
// two), then ONE `character.update` overlays the accepted patch + the name.
//
// NO SNAPSHOT by construction — nothing existing is written — and the result says so (the apply panel
// teaches snapshot-first, so its absence here must not read as a miss). Signals: the copy's `refinery`
// signals are stamped FRESH from this session's latest score/analyze runs — they describe exactly the
// copy's content (§17's carry decision; unlike the handoff-clear precedent, where the signals described
// someone else's critique). The session stays anchored to the ORIGINAL character (a card is canon, not a
// pipeline artifact) and flips to completed like any terminal act.

import { updateCharacterSchema } from "@orb/contracts/character";
import { REFINERY_STAGE_PAYLOADS, refineryCustomRunConfigSchema, refinerySessionNameSchema } from "@orb/contracts/refinery";
import { refinerySessions } from "@orb/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { latestRunRowOf } from "../persistence/queries.ts";
import { buildPatch, resolveApplyBasis } from "../substrate/accept-belts.ts";

const COPY_NAME_SUFFIX = " (refined)";
const overallScoreCoreSchema = z.object({ overallScore: z.number() });

export function createApplyAsCopy(ctx: RefineryContext): RefineryService["applyAsCopy"] {
  return async ({ principal, sessionId, accepts, name, rewriteRunId }) => {
    const ownerId = principal.userId;
    // Base = the LIVE card (§17 — the user reviewed diffs against it), same belts + loads as the merge
    // arm (the shared preamble resolver).
    const { session, liveCard, applied, dropped, chosen } = await resolveApplyBasis(ctx, { ownerId, sessionId, rewriteRunId, accepts });
    if (chosen.length === 0) {
      // Every accept died on the belts — no copy is minted for nothing (the honest zero-write arm).
      return { applied, dropped, character: null };
    }

    const { patch } = buildPatch(liveCard, chosen);
    const copyName = name === undefined || name.trim().length === 0 ? `${liveCard.name}${COPY_NAME_SUFFIX}` : refinerySessionNameSchema.parse(name);
    // The chassis + the overlay: duplicate carries what duplicate carries; the update runs character's
    // whole write belt over the accepted patch + the copy's name.
    const duplicated = await ctx.duplicateCharacter({ principal, characterId: session.characterId });
    const input = updateCharacterSchema.parse({ ...patch, name: copyName });
    const detail = await ctx.updateCharacter({ principal, characterId: duplicated.id, input });

    // Fresh signal stamps from THIS session's latest runs — they describe exactly the copy's content.
    const [scoreRow, analyzeRow] = await Promise.all([latestRunRowOf(ctx.db, sessionId, "score"), latestRunRowOf(ctx.db, sessionId, "analyze")]);
    const score = scoreRow === undefined ? null : overallScoreCoreSchema.safeParse(scoreRow.payload);
    if (score?.success === true) {
      await ctx.stampRefinerySignals({ ownerId, characterId: duplicated.id, patch: { score: score.data.overallScore } });
    }
    const analyzeIsFixed = analyzeRow !== undefined && !refineryCustomRunConfigSchema.safeParse(analyzeRow.payloadConfig).success;
    const analysis = analyzeIsFixed ? REFINERY_STAGE_PAYLOADS.analyze.safeParse(analyzeRow.payload) : null;
    if (analysis?.success === true) {
      await ctx.stampRefinerySignals({ ownerId, characterId: duplicated.id, patch: { analysis: analysis.data } });
    }

    // The terminal act completes the session — anchored to the ORIGINAL character, untouched.
    await ctx.db.update(refinerySessions).set({ status: "completed", updatedAt: ctx.now() }).where(eq(refinerySessions.id, sessionId));
    return { applied, dropped, character: detail };
  };
}
