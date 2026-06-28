import type { UserId } from "@orb/kit/ids";
import type { ByModelOpts } from "../contract/params";
import type { StatsContext, StatsService } from "../contract/service";
import type { ModelStatRow } from "../contract/views";
import { readByModel } from "../persistence/rollups";

// byModel — per-(model, provider) usage from model_stats (desc by generations) + on-read latency + the
// distinct-character "reach" merged in. limit defaults to 50, capped at 200.

export function createByModel(ctx: StatsContext): Pick<StatsService, "byModel"> {
  async function byModel(ownerId: UserId, opts?: ByModelOpts): Promise<ModelStatRow[]> {
    return await readByModel(ctx.db, ownerId, opts);
  }
  return { byModel };
}
