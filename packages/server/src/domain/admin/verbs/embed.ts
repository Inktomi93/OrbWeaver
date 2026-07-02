// verb: embedCharacterCard — the admin-gated INLINE single-card embed (PD-90; Tier-4-Transport.md
// esoteric #10). adminProcedure-gated at transport AND `requireAdmin` here (defense-in-depth): it is the
// only write that drives local GPU embedding inline (the bulk path is the admin-only `embed-corpus`
// workload), so "who can drive the embed engine" stays consistent. The cross-domain producer-ownership
// check (the caller must OWN the character; the vector row carries no ownerId to spoof — D20) lives in
// the injected `EmbedProducerPort`, composed at the entry root from character (owner-scoped card read +
// card-text projection) and embeddings (the one write path). A not-owned / missing / textless card
// resolves the port `false` → a leak-free not-found (owner-scoping collapses "foreign" and "gone").

import { DomainNotFoundError } from "@orb/kit/errors";
import type { EmbedCharacterCardParams } from "../contract/params";
import type { AdminContext, AdminService } from "../contract/service";
import { requireAdmin } from "../guard";

export function createEmbed(ctx: AdminContext): Pick<AdminService, "embedCharacterCard"> {
  const embedCharacterCard: AdminService["embedCharacterCard"] = async (
    params: EmbedCharacterCardParams,
  ): Promise<void> => {
    requireAdmin(params.principal);
    const embedded = await ctx.embed.embedCharacterCard(params.principal, params.characterId);
    if (!embedded) {
      throw new DomainNotFoundError("character", params.characterId);
    }
    await ctx.audit(
      {
        actorUserId: params.principal.userId,
        action: "admin.embedCharacterCard",
        entityType: "character",
        entityId: params.characterId,
      },
      ctx.now(),
    );
  };
  return { embedCharacterCard };
}
