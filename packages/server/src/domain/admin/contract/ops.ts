import type { GetCharacterCardOp, LoadCharacterCardTextOp } from "@orb/contracts/character";
import type { CardTextStoreInput, StoreResult } from "@orb/contracts/embeddings";
import type { ListSessionsForUserOp, RevokeAllSessionsForUserOp, RevokeSessionOp } from "@orb/contracts/session";
import type { RoleClientsWithSignal } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import type { SessionsService } from "#domain/sessions";
import type { AdminContext } from "./service.ts";

/** Session capabilities plus the transport-owned eviction edge; admin owns their ordering and granularity. */
export interface AdminSessionPolicyDeps {
  readonly listForUser: ListSessionsForUserOp;
  readonly revoke: RevokeSessionOp;
  readonly revokeAllForUser: RevokeAllSessionsForUserOp;
  readonly revokeAllForUserStatement: SessionsService["revokeAllForUserStatement"];
  readonly evictUserSockets: AdminContext["sessions"]["evictUserSockets"];
  readonly linkExternalIdStatement: SessionsService["linkExternalIdStatement"];
  readonly settleUnclaimedLink: AdminContext["sessions"]["settleUnclaimedLink"];
  readonly localUserInsertStatement: SessionsService["localUserInsertStatement"];
  readonly isReservedHandle: AdminContext["sessions"]["isReservedHandle"];
}

/** Card producer ops stay Principal-scoped; the caller's live binding funds its own card space. */
export interface AdminCardEmbedDeps {
  readonly getCard: GetCharacterCardOp;
  readonly loadCardText: LoadCharacterCardTextOp;
  readonly store: (input: CardTextStoreInput) => Promise<StoreResult>;
  readonly roleClientsFor: (funderUserId: UserId) => Promise<Pick<RoleClientsWithSignal, "resolved">>;
}
