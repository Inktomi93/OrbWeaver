// A committed event fans under its seq; a dropped append fans with `seq: null` only when `fansWhenDropped` says so (D342).
// Quiet mode never coalesces terminal or memory-phase events.
import type { LiveOnlyChatEventType } from "@orb/contracts/chat";
import { fansWhenDropped } from "@orb/contracts/chat";
import type { ChatPublication, ChatPublicationDeps } from "../contract/publication.ts";

type AppendOutcome = Awaited<ReturnType<ChatPublicationDeps["bus"]["emit"] | ChatPublicationDeps["bus"]["emitAfterClaim"]>>;

const QUIET_COALESCABLE = { roomEntityChanged: true, chatDeleted: false, memoryRecall: false } as const satisfies Record<LiveOnlyChatEventType, boolean>;
export function createChatPublication(deps: ChatPublicationDeps): ChatPublication {
  // The verdict is whether the append landed (or another caller's claim already did), never whether it fanned.
  const fan = (outcome: AppendOutcome): boolean => {
    if (outcome === false) {
      return true;
    }
    if (outcome === null) {
      return false;
    }
    if (outcome.seq !== null) {
      deps.publish(outcome);
      return true;
    }
    if (fansWhenDropped(outcome.event)) {
      deps.publish({ seq: null, event: outcome.event });
    }
    return false;
  };
  const emitChecked: ChatPublication["emitChecked"] = async (event, claimStatement) =>
    fan(claimStatement === undefined ? await deps.bus.emit(event) : await deps.bus.emitAfterClaim(event, claimStatement));
  return {
    emitChecked,
    emit: async (event, continuedBody): Promise<void> => {
      fan(await deps.bus.emit(event, continuedBody));
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
