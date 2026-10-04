// verb: syncTargetGenerations — move an owner's stored targets to what their vector bindings resolve to now. The
// stored target, not the previous binding, is what a re-point is measured against: re-binding the encoder the
// target already names moves nothing, and a move queues its rebuild through the resolver's own trigger.

import { NoConnectionError } from "@orb/inference";
import { DomainNoCredentialError } from "@orb/kit/errors";
import type { UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { EmbeddingsContext } from "../context.ts";
import type { GenerationTask } from "../contract/generation.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { resolveTargetGeneration } from "../substrate/generation.ts";
import { resolveImageSpace } from "../substrate/task-model.ts";

/** A binding that cannot resolve yet: a revoked or missing key, or no usable connection. Its first write after it
 *  can resolve moves the target and owns the failure, so the sync leaves it alone. */
function bindingUnresolvable(error: unknown): boolean {
  return error instanceof DomainNoCredentialError || error instanceof NoConnectionError;
}

/** One target's sync. An unresolvable binding leaves the target where it is; anything else (a database error, an
 *  embedder whose width does not fit) also leaves it, and is logged, because no write is waiting to report it. */
async function syncOne(ownerId: UserId, task: GenerationTask, sync: () => Promise<unknown>): Promise<void> {
  // @orb-waive caught-failure-ownership(error): an unresolvable binding is owned by the first write after it can
  // resolve, which moves the target and reports its own failure; every other failure is logged here. Ends if this
  // sync gates a write.
  try {
    await sync();
  } catch (error) {
    if (!bindingUnresolvable(error)) {
      getLog().error({ err: error, ownerId, task }, "embeddings: the target sync after a re-point failed");
    }
  }
}

export function createSyncTargetGenerations(ctx: EmbeddingsContext): EmbeddingsService["syncTargetGenerations"] {
  return async (ownerId: UserId): Promise<void> => {
    await syncOne(ownerId, "embed", () => resolveTargetGeneration(ctx, ownerId, "embed"));
    await syncOne(ownerId, "imageEmbed", async () => {
      const space = await resolveImageSpace(ctx, ownerId);
      return space === null ? null : await resolveTargetGeneration(ctx, ownerId, "imageEmbed", space.via);
    });
  };
}
