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
      // A hostless room and a room whose host is disabled refuse alike, as a turn does: neither has a host whose
      // connections a member may spend.
      const hostUserId = await deps.resolveConsentingHostUserId(chatId);
      if (hostUserId === null) {
        throw new DomainNotFoundError("chat", chatId);
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
