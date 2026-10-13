// D298: the caller clears room visibility before the host's authority or storage is reached.
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ImageryRoomAccess, ImageryRoomAccessDeps } from "../contract/imagery-access.ts";
import { resolveTurnIdentityVia } from "../substrate/turn-access.ts";

export function createImageryRoomAccess(deps: ImageryRoomAccessDeps): ImageryRoomAccess {
  return {
    callerInChat: async (caller, chatId) => (await deps.resolveViewerVisibility(chatId, caller.userId)) !== null,
    resolveRoomRunAs: async (caller, chatId, subjectCharacterId): ReturnType<ImageryRoomAccess["resolveRoomRunAs"]> => {
      if ((await deps.resolveViewerVisibility(chatId, caller.userId)) === null) {
        throw new DomainNotFoundError("chat", chatId);
      }
      const hostUserId = await deps.resolveChatHostUserId(chatId);
      if (hostUserId === null) {
        throw new Error(`imagery: chat ${chatId} has no host to run the preview as`);
      }
      const { runAsUserId } = resolveTurnIdentityVia({ principalUserId: caller.userId, hostUserId });
      // A member may spend the host's Utility connection only on a present room subject.
      if (runAsUserId !== caller.userId && subjectCharacterId !== undefined && !(await deps.isCharacterSeated(chatId, subjectCharacterId))) {
        throw new DomainNotFoundError("character", subjectCharacterId);
      }
      return runAsUserId === caller.userId ? caller : await deps.resolveHostPrincipal(runAsUserId);
    },
  };
}
