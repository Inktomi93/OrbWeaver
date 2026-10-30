import type { MemoryEmbedSpace } from "@orb/contracts/embeddings";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { EmbeddingsIndexerContext } from "./service.ts";

export type LiveEmbedSpace = Pick<MemoryEmbedSpace, "model">;
export interface LiveEmbedSpaceDeps {
  readonly roleClientsFor: (...args: Parameters<EmbeddingsIndexerContext["roleClientsFor"]>) => Promise<Pick<RoleClients, "resolved">>;
}
