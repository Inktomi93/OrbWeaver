// verb: embedCharacterCard — admin-gated inline single-card embed. The cross-domain producer-ownership
// check lives in the injected EmbedProducerPort; a not-owned/missing/textless card resolves the port
// false → a leak-free not-found.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { AdminContext } from "../context";
import type { EmbedCharacterCardParams } from "../contract/params";
import type { AdminService } from "../contract/service";
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
