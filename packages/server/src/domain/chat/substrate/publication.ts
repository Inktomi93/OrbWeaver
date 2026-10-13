// Only committed/stamped bytes may fan; quiet mode never coalesces terminal or memory-phase events.
import type { LiveOnlyChatEventType } from "@orb/contracts/chat";
import type { ChatPublication, ChatPublicationDeps } from "../contract/publication.ts";

const QUIET_COALESCABLE = { roomEntityChanged: true, chatDeleted: false, memoryRecall: false } as const satisfies Record<LiveOnlyChatEventType, boolean>;
export function createChatPublication(deps: ChatPublicationDeps): ChatPublication {
  const emitChecked: ChatPublication["emitChecked"] = async (event, claimStatement) => {
    const logged = claimStatement === undefined ? await deps.bus.emit(event) : await deps.bus.emitAfterClaim(event, claimStatement);
    if (logged === false) {
      return true;
    }
    if (logged !== null) {
      deps.publish(logged);
      return true;
    }
    return false;
  };
  return {
    emitChecked,
    emit: async (event): Promise<void> => {
      await emitChecked(event);
    },
    prepareCreationEvent: (event): ReturnType<ChatPublication["prepareCreationEvent"]> => {
      const prepared = deps.bus.prepareCreation(event);
      return { statement: prepared.statement, publishCommitted: (): void => deps.publish(prepared.publishCommitted()) };
    },
    emitLive: (event): void => {
      const publish = (): void => deps.publish({ seq: null, event });
      if (QUIET_COALESCABLE[event.type] && event.type === "roomEntityChanged" && deps.silenceRoomEntityFan(event.chatId, event.entity, publish)) {
        return;
      }
      publish();
    },
  };
}
