// verb: listCardEvolutionProposals — the owner's PENDING card-drift proposals for one of their characters
// (the character-page review surface, chat-crew-design/04 §8). Owner-scoped via the `characters.ownerId`
// join in persistence; a foreign/absent character yields an empty list (no existence leak). A read: no
// audit, no emit.

import type { CharacterContext } from "../context";
import type { ListCardEvolutionProposalsParams } from "../contract/params";
import type { CharacterService } from "../contract/service";
import type { CardEvolutionProposalView } from "../contract/views";
import { listPendingProposals } from "../persistence/card-evolution-proposals";

export function createListCardEvolutionProposals(ctx: CharacterContext): CharacterService["listCardEvolutionProposals"] {
  return async ({ principal, characterId }: ListCardEvolutionProposalsParams): Promise<CardEvolutionProposalView[]> => {
    const rows = await listPendingProposals(ctx.db, principal.userId, characterId);
    return rows.map((row) => ({
      id: row.id,
      characterId: row.characterId,
      chatId: row.chatId,
      changes: row.changes,
      sourceSpan: row.sourceSpan,
      status: row.status,
      createdAt: row.createdAt,
    }));
  };
}
