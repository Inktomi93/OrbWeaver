import type { MemoryEmbedSpace } from "@orb/contracts/embeddings";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { EmbeddingsContext } from "./service.ts";

export type LiveEmbedSpace = Pick<MemoryEmbedSpace, "model">;
export interface LiveEmbedSpaceDeps {
  readonly roleClientsFor: (...args: Parameters<EmbeddingsContext["roleClientsFor"]>) => Promise<Pick<RoleClients, "resolved">>;
}
