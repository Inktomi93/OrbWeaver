import type { MemoryEmbedSpace } from "@orb/contracts/embeddings";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { UserId } from "@orb/kit/ids";

export type LiveEmbedSpace = Pick<MemoryEmbedSpace, "model">;
export interface LiveEmbedSpaceDeps {
  readonly roleClientsFor: (ownerId: UserId) => Promise<Pick<RoleClients, "resolved">>;
}
