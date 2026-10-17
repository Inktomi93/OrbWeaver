// A private prompt preview sees only the requesting viewer's history, even though the host pays.
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ExtractQuietDeps } from "../contract/context.ts";
import type { VisibleExtractQuiet, VisibleExtractQuietDeps, VisibleExtractQuietGateDeps } from "../contract/imagery-access.ts";

export function createQuietExtractionInputs(
  deps: Pick<VisibleExtractQuietDeps, "roleClientsFor" | "getCard" | "resolveHostPrincipal">,
): Pick<ExtractQuietDeps, "summarize" | "getCard"> {
  return {
    summarize: async (funderUserId, ...args) => (await deps.roleClientsFor(funderUserId)).summarize(...args),
    getCard: async ({ ownerId, characterId }) => deps.getCard({ principal: await deps.resolveHostPrincipal(ownerId), characterId }),
  };
}

export function createVisibleExtractQuietGate(deps: VisibleExtractQuietGateDeps): VisibleExtractQuiet {
  return async ({ caller, ...params }) => {
    const visibility = await deps.resolveViewerVisibility(params.chatId, caller.userId);
    if (visibility === null) {
      throw new DomainNotFoundError("chat", params.chatId);
    }
    return deps.extractQuiet({ ...params, historyFloorSeq: visibility.historyFloorSeq });
  };
}
