// The owner's active embed-space MODEL TAG for a chunk-count read — or the empty tag when they have no `embed`
// binding, so the count is honestly zero (no stored chunk carries ""). One home so the eight count readers
// never re-spell the null arm.

import type { UserId } from "@orb/kit/ids";
import type { DatabankContext } from "../context.ts";
import { NO_EMBED_SPACE_MODEL } from "../contract/service.ts";

export async function activeSpaceModel(ctx: Pick<DatabankContext, "getActiveEmbedSpace">, ownerId: UserId): Promise<string> {
  return (await ctx.getActiveEmbedSpace(ownerId))?.model ?? NO_EMBED_SPACE_MODEL;
}
