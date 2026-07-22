// domain/character/contract/errors — typed domain errors. CharacterNotFoundError collapses "missing" and
// "not the caller's" into one answer (no foreign-existence leak). CharacterOperationError is a coded
// operational failure: handle_conflict (per-owner unique index fired) and handle_reserved (a create/update
// tried to occupy the __group__* synthetic namespace).

import { DomainNotFoundError, DomainOperationError } from "@orb/kit/errors";
import type { AssetId, CardEvolutionProposalId, CharacterId } from "@orb/kit/ids";

export class CharacterNotFoundError extends DomainNotFoundError {
  public readonly characterId: CharacterId;
  constructor(characterId: CharacterId) {
    super("character", characterId);
    this.characterId = characterId;
    this.name = this.constructor.name;
  }
}

/** Thrown by create/update when a supplied avatarAssetId is missing or not the caller's — the FK alone
 *  proves existence, never ownership. */
export class AssetNotFoundError extends DomainNotFoundError {
  public readonly assetId: AssetId;
  constructor(assetId: AssetId) {
    super("asset", assetId);
    this.assetId = assetId;
    this.name = this.constructor.name;
  }
}

export const CHARACTER_HANDLE_CONFLICT = "handle_conflict";
export const CHARACTER_HANDLE_RESERVED = "handle_reserved";
/** accept refused: the proposal already resolved (accepted/dismissed/superseded) — not a leak, a state error. */
export const CHARACTER_PROPOSAL_NOT_PENDING = "proposal_not_pending";
/** `update` was given a `kind:"external"` carried-background URL that could not be materialized into an owned
 *  image asset (unreachable / not an image / too large — side-eye F-P0-2). BAD_REQUEST; the message carries
 *  the honest reason, never the URL. */
export const CHARACTER_BACKGROUND_UNAVAILABLE = "background_unavailable";

export class CharacterOperationError extends DomainOperationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = this.constructor.name;
  }
}

/** A card-evolution proposal is missing OR its character is not the caller's — one leak-free answer (the
 *  `characters.ownerId` join is the authority gate; a non-owner never learns the proposal exists). */
export class CardEvolutionProposalNotFoundError extends DomainNotFoundError {
  public readonly proposalId: CardEvolutionProposalId;
  constructor(proposalId: CardEvolutionProposalId) {
    super("card_evolution_proposal", proposalId);
    this.proposalId = proposalId;
    this.name = this.constructor.name;
  }
}
