// verb: acceptCardEvolution — the safety story (chat-crew-design/02 §5). Owner-only; per-change pickable.
// Takes an AUTOMATIC `pre-evolution` snapshot FIRST (accept is always reversible via `restore` — the D28
// history log doing its job — the restore.ts snapshot-current-first precedent), THEN folds the picked
// changes onto the live card through the same in-place write path `update` uses (fresh contentHash +
// tokenSize + `character.updated` emit so the indexer re-embeds), THEN flips the proposal to `accepted`.
// A missing/foreign proposal → CardEvolutionProposalNotFoundError (leak-free, the join enforces ownership);
// a non-pending proposal → CharacterOperationError(proposal_not_pending).

import { cardContentHash } from "#kit/serde/card";
import type { CharacterContext } from "../context";
import { CardEvolutionProposalNotFoundError, CHARACTER_PROPOSAL_NOT_PENDING, CharacterNotFoundError, CharacterOperationError } from "../contract/errors";
import type { AcceptCardEvolutionParams } from "../contract/params";
import type { CharacterService } from "../contract/service";
import { appendSnapshot, writeCardInPlace } from "../persistence/card";
import { loadOwnedProposal, resolvePendingProposal } from "../persistence/card-evolution-proposals";
import { cardOf, loadOwnedCharacterRow } from "../persistence/queries";
import { applyCardEvolutionChanges } from "../substrate/card-evolution";
import { changedCardFields } from "../substrate/card-merge";
import { cardTokenSize } from "../substrate/card-tokens";

const PRE_EVOLUTION_LABEL = "pre-evolution";

export function createAcceptCardEvolution(ctx: CharacterContext): CharacterService["acceptCardEvolution"] {
  return async ({ principal, proposalId, pickedChangeIndices }: AcceptCardEvolutionParams): Promise<void> => {
    const ownerId = principal.userId;
    const proposal = await loadOwnedProposal(ctx.db, ownerId, proposalId);
    if (proposal === undefined) {
      throw new CardEvolutionProposalNotFoundError(proposalId);
    }
    if (proposal.status !== "pending") {
      throw new CharacterOperationError(CHARACTER_PROPOSAL_NOT_PENDING, `card-evolution proposal ${proposalId} is already ${proposal.status}`);
    }
    const { characterId } = proposal;
    const current = await loadOwnedCharacterRow(ctx.db, ownerId, characterId);
    if (current === undefined) {
      throw new CharacterNotFoundError(characterId);
    }

    // pickedChangeIndices selects a subset (the owner can take one change and reject another); absent = all.
    const picked = pickedChangeIndices === undefined ? proposal.changes : proposal.changes.filter((_, i) => pickedChangeIndices.includes(i));

    const at = ctx.now();
    // Snapshot FIRST — the accept must be reversible even if the picked set is empty (an audit-trail commit).
    await appendSnapshot(ctx.db, {
      id: ctx.newSnapshotId(),
      characterId,
      content: cardOf(current),
      label: PRE_EVOLUTION_LABEL,
      createdAt: at,
    });

    const before = cardOf(current);
    const next = applyCardEvolutionChanges(before, picked);
    const nextHash = cardContentHash(next);
    const contentChanged = nextHash !== current.contentHash;
    if (contentChanged) {
      const written = await writeCardInPlace(ctx.db, characterId, ownerId, {
        ...next,
        contentHash: nextHash,
        tokenSize: cardTokenSize(next),
      });
      if (!written) {
        throw new CharacterNotFoundError(characterId);
      }
      ctx.emit({ type: "character.updated", characterId, contentChanged: true });
    }

    await resolvePendingProposal(ctx.db, proposalId, "accepted", at);

    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "character.acceptCardEvolution",
        entityType: "character",
        entityId: characterId,
        metadata: { proposalId, fields: changedCardFields(before, next) },
      },
      at,
    );
    ctx.emitUserEvent(ownerId, { type: "charactersChanged", characterId });
  };
}
