// Progress and new writes follow the current binding, not the last completed retrieval space.
import type { UserId } from "@orb/kit/ids";
import type { LiveEmbedSpace, LiveEmbedSpaceDeps } from "../contract/live-embed-space.ts";
import { requireTaskModel } from "../substrate/task-model.ts";

export function createGetLiveEmbedSpace(deps: LiveEmbedSpaceDeps): (ownerId: UserId) => Promise<LiveEmbedSpace | null> {
  return async (ownerId) => {
    const model = await requireTaskModel(deps, ownerId, "embed");
    return model === null ? null : { model };
  };
}
