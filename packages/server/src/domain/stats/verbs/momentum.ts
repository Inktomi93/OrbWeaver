import type { UserId } from "@orb/kit/ids";
import type { StatsContext, StatsService } from "../contract/service.ts";
import type { CharacterMomentum } from "../contract/views.ts";
import { readCharacterMomentum } from "../persistence/activity.ts";

// momentum — per-character attention shift between the two most-recent active months (rising / falling),
// anchored to the data's latest months (on-read canon scan — character_stats is cumulative, no monthly axis).

export function createMomentum(ctx: StatsContext): Pick<StatsService, "momentum"> {
  async function momentum(ownerId: UserId, limit?: number): Promise<CharacterMomentum> {
    return await readCharacterMomentum(ctx.db, ownerId, limit);
  }
  return { momentum };
}
