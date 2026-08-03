// domain/stats/verbs/economics — PD-22: the two economics-projection reads (the seam's Tier 2). NOT a tRPC
// verb — the stats router never exposes these; they are the stats-OWNED ops INJECTED into discovery at the
// composition root (mirroring `embeddings.writeHubScores` → discovery). Each returns a NARROWED, already-
// aggregated economics result (@orb/contracts/stats) so the consumer can never re-sum a raw economics
// column (Knowledge-Cluster inv #5). Both bind `ownerId = principal.userId` upstream (self-scoped, D20/D23).

import type { CharacterEconomics, CharacterModelEconomics } from "@orb/contracts/stats";
import type { UserId } from "@orb/kit/ids";
import type { StatsContext, StatsService } from "../contract/service.ts";
import { readCharacterEconomics, readCharacterModelEconomics } from "../persistence/messages-economics.ts";

export function createEconomics(ctx: StatsContext): Pick<StatsService, "characterEconomics" | "characterModelEconomics"> {
  return {
    characterEconomics: (ownerId: UserId): Promise<CharacterEconomics[]> => readCharacterEconomics(ctx.db, ownerId),
    characterModelEconomics: (ownerId: UserId): Promise<CharacterModelEconomics[]> => readCharacterModelEconomics(ctx.db, ownerId),
  };
}
