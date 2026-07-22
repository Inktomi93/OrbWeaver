// verb: proposeCardEvolution — file a card-drift proposal (chat-crew-design/02 §5, 03 §2). ENV-ONLY: no
// principal. It is a trusted producer op — the crew card-evolution runner (CW3) calls it for host-owned
// cards, but ANY filer (an import pass, a human tool) can file through the same verb with zero crew
// involvement (that is the point — propose-don't-dispose is a character capability, not a crew one). The
// insert supersedes any pending proposal for the same `(characterId, chatId)`; the ACCEPT (a separate,
// owner-gated verb) is where the card actually changes. Emits the `crew.cardProposalCreated` domain-event
// mirror (04 §4) so automation can react — ONLY for a chat-scoped (crew) filing; a chat-less import/human
// filing is not crew activity and carries no ChatId to key the event on.

import type { CharacterContext } from "../context";
import type { ProposeCardEvolutionParams } from "../contract/params";
import type { CharacterService } from "../contract/service";
import { insertOrSupersedeProposal } from "../persistence/card-evolution-proposals";

export function createProposeCardEvolution(ctx: CharacterContext): CharacterService["proposeCardEvolution"] {
  return async ({ characterId, chatId, changes, sourceSpan }: ProposeCardEvolutionParams) => {
    const id = ctx.newProposalId();
    const at = ctx.now();
    await insertOrSupersedeProposal(ctx.db, { id, characterId, chatId, changes, sourceSpan, createdAt: at }, at);
    if (chatId !== null) {
      ctx.emit({ type: "crew.cardProposalCreated", chatId, characterId, proposalId: id });
    }
    return id;
  };
}
