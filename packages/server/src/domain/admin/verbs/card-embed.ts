import type { AdminCardEmbedDeps } from "../contract/ops.ts";
import type { AdminContext } from "../contract/service.ts";

/** Resolve the owned card and its caller-funded space afresh for every inline admin embed. */
export function createAdminCardEmbed(deps: AdminCardEmbedDeps): AdminContext["embed"] {
  return {
    embedCharacterCard: async (principal, characterId): Promise<boolean> => {
      const card = await deps.getCard({ principal, characterId });
      if (card === null) {
        return false;
      }
      const text = await deps.loadCardText(characterId);
      if (text === null || text.length === 0) {
        return false;
      }
      const space = await (await deps.roleClientsFor(principal.userId)).resolved("embed");
      if (space === null) {
        return false;
      }
      await deps.store({ kind: "card", lens: "card-text", ownerId: principal.userId, characterId, content: text, model: space.model });
      return true;
    },
  };
}
