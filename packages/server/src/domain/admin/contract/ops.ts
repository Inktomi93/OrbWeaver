import type { CardTextStoreInput, StoreResult } from "@orb/contracts/embeddings";
import type { RoleClientsWithSignal } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import type { CharacterService } from "#domain/character";
import type { SessionsService } from "#domain/sessions";
import type { AdminContext } from "./service.ts";

/** Session capabilities plus the transport-owned eviction edge; admin owns their ordering and granularity. */
export interface AdminSessionPolicyDeps {
  readonly listForUser: SessionsService["listForUser"];
  readonly revoke: SessionsService["revoke"];
  readonly revokeAllForUser: SessionsService["revokeAllForUser"];
  readonly revokeAllForUserStatement: AdminContext["sessions"]["revokeAllForUserStatement"];
  readonly evictUserSockets: AdminContext["sessions"]["evictUserSockets"];
  readonly linkExternalIdStatement: AdminContext["sessions"]["linkExternalIdStatement"];
  readonly settleUnclaimedLink: AdminContext["sessions"]["settleUnclaimedLink"];
  readonly localUserInsertStatement: AdminContext["sessions"]["localUserInsertStatement"];
  readonly isReservedHandle: AdminContext["sessions"]["isReservedHandle"];
}

/** Card producer ops stay Principal-scoped; the caller's live binding funds its own card space. */
export interface AdminCardEmbedDeps {
  readonly getCard: CharacterService["getCard"];
  readonly loadCardText: CharacterService["loadCardText"];
  readonly store: (input: CardTextStoreInput) => Promise<StoreResult>;
  readonly roleClientsFor: (funderUserId: UserId) => Promise<Pick<RoleClientsWithSignal, "resolved">>;
}
