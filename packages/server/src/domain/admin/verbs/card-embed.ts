import { embedDtypeOf, embedSpaceOf } from "@orb/contracts/inference";
import type { AdminCardEmbedDeps } from "../contract/ops.ts";
import type { AdminContext } from "../contract/service.ts";

/** Resolve the owned card and its caller-funded space afresh for every inline admin embed. */
export function createAdminCardEmbed(deps: AdminCardEmbedDeps): AdminContext["embed"] {
  return {
    embedCharacterCard: async (principal, characterId, signal): Promise<boolean> => {
      const card = await deps.getCard({ principal, characterId });
      if (card === null) {
        return false;
      }
      const text = await deps.loadCardText(characterId);
      if (text === null || text.length === 0) {
        return false;
      }
      const space = await (await deps.roleClientsFor(principal.userId)).resolved("embed", signal);
      if (space === null) {
        return false;
      }
      await deps.store({
        lens: "card-text",
        ownerId: principal.userId,
        characterId,
        content: text,
        model: embedSpaceOf(space.model, embedDtypeOf(space.capability)),
        signal,
      });
      return true;
    },
  };
}
