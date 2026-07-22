// verb: dismissCardEvolution — owner declines a card-drift proposal (chat-crew-design/02 §5). Owner-only
// (the `characters.ownerId` join in `loadOwnedProposal` is the gate); a status flip to `dismissed`, never a
// delete (the audit trail survives — propose-don't-dispose). A missing/foreign/non-pending proposal is a
// leak-free no-op refusal: CardEvolutionProposalNotFoundError.

import type { CharacterContext } from "../context";
import { CardEvolutionProposalNotFoundError } from "../contract/errors";
import type { DismissCardEvolutionParams } from "../contract/params";
import type { CharacterService } from "../contract/service";
import { loadOwnedProposal, resolvePendingProposal } from "../persistence/card-evolution-proposals";

export function createDismissCardEvolution(ctx: CharacterContext): CharacterService["dismissCardEvolution"] {
  return async ({ principal, proposalId }: DismissCardEvolutionParams): Promise<void> => {
    const proposal = await loadOwnedProposal(ctx.db, principal.userId, proposalId);
    if (proposal === undefined) {
      throw new CardEvolutionProposalNotFoundError(proposalId);
    }
    const at = ctx.now();
    await resolvePendingProposal(ctx.db, proposalId, "dismissed", at);
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "character.dismissCardEvolution",
        entityType: "character",
        entityId: proposal.characterId,
        metadata: { proposalId },
      },
      at,
    );
  };
}
