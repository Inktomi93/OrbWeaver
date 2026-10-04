// verb: spaceStatus — is the owner's vector search paused for a rebuild? The same generation read every vector
// verb refuses on, so the role row's rebuild line and search's own refusal can never disagree.

import type { SearchSpaceStatus } from "@orb/contracts/search";
import type { UserId } from "@orb/kit/ids";
import type { SearchContext } from "../context.ts";
import { readGeneration } from "../persistence/active-space.ts";

export function createSpaceStatus(ctx: Pick<SearchContext, "db">): (params: { readonly ownerId: UserId }) => Promise<SearchSpaceStatus> {
  return async ({ ownerId }) => {
    const [text, image] = await Promise.all([readGeneration(ctx.db, ownerId, "embed"), readGeneration(ctx.db, ownerId, "imageEmbed")]);
    return { paused: text.status === "moving" || image.status === "moving" };
  };
}
