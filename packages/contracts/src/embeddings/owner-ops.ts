// Shared owner data and injected operations; implementations and authority resolution stay in server domains.

import type { EmbedGenerationId, UserId } from "@orb/kit/ids";

/** The owner and concrete vector-space receipt shared by chat memory and embedding reindex.
 *  Both consume this immutable identity; neither imports the other domain's context. */

export interface MemoryEmbedSpace {
  readonly ownerId: UserId;
  readonly model: string;
  readonly generationId: EmbedGenerationId;
  readonly generationEpoch: number;
}
