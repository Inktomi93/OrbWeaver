// verb: syncTargetGenerations — move an owner's stored targets to what their vector bindings resolve to now. The
// stored target, not the previous binding, is what a re-point is measured against: re-binding the encoder the
// target already names moves nothing, and a move queues its rebuild through the resolver's own trigger.

import type { UserId } from "@orb/kit/ids";
import type { EmbeddingsContext } from "../context.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { resolveTargetGeneration } from "../substrate/generation.ts";
import { resolveImageSpace } from "../substrate/task-model.ts";

/** One target's sync: whether it resolved. A binding that cannot resolve or embed yet leaves the target where it is. */
async function syncOne(sync: () => Promise<unknown>): Promise<boolean> {
  // @orb-waive caught-failure-ownership(catch): an unresolvable or unreachable binding has nothing to move the
  // target to; the first write after it can resolve moves it and owns that failure. Ends if this sync gates a write.
  try {
    await sync();
    return true;
  } catch {
    return false;
  }
}

export function createSyncTargetGenerations(ctx: EmbeddingsContext): EmbeddingsService["syncTargetGenerations"] {
  return async (ownerId: UserId): Promise<void> => {
    await syncOne(() => resolveTargetGeneration(ctx, ownerId, "embed"));
    await syncOne(async () => {
      const space = await resolveImageSpace(ctx, ownerId);
      return space === null ? null : await resolveTargetGeneration(ctx, ownerId, "imageEmbed", space.via);
    });
  };
}
