import type { ChatLivePublish, LiveOnlyChatBusEvent } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import type { createChatBus } from "../bus.ts";
import type { ChatServiceDeps } from "./context.ts";

export interface ChatPublicationDeps {
  readonly bus: Pick<ReturnType<typeof createChatBus>, "emit" | "emitAfterClaim" | "prepareCreation">;
  readonly publish: (event: ChatLivePublish) => void;
  readonly silenceRoomEntityFan: (
    chatId: ChatId,
    entity: Extract<LiveOnlyChatBusEvent, { type: "roomEntityChanged" }>["entity"],
    publish: () => void,
  ) => boolean;
}
export type ChatPublication = Pick<ChatServiceDeps, "emit" | "emitChecked" | "prepareCreationEvent" | "emitLive">;
