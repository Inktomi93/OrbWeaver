// Progress and new writes follow the current binding, not the last completed retrieval space.
import type { UserId } from "@orb/kit/ids";
import type { LiveEmbedSpace, LiveEmbedSpaceDeps } from "../contract/live-embed-space.ts";
import { requireTaskModel } from "../substrate/task-model.ts";

export function createGetLiveEmbedSpace(deps: LiveEmbedSpaceDeps): (ownerId: UserId) => Promise<LiveEmbedSpace | null> {
  return async (ownerId) => {
    // Databank reads only the live space's tag, to key its chunk counts; its reads carry no signal yet (a filed
    // draft threads one), and each resolve keeps its own deadline.
    const model = await requireTaskModel(deps, ownerId, new AbortController().signal);
    return model === null ? null : { model };
  };
}
