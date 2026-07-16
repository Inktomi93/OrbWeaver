import type { CharacterId, UserId } from "@orb/kit/ids";
import type { StatsContext, StatsService } from "../contract/service";
import type { CharacterStatsView } from "../contract/views";
import { readCharacter } from "../persistence/rollups";

// character — a single character's rollup (one row per character, D28) + on-read latency scoped to it.
// Scoped to the owner's characters (character_stats has no ownerId — D23; the read JOINs characters).

export function createCharacter(ctx: StatsContext): Pick<StatsService, "character"> {
  async function character(ownerId: UserId, characterId: CharacterId): Promise<CharacterStatsView | null> {
    return await readCharacter(ctx.db, ownerId, characterId);
  }
  return { character };
}
