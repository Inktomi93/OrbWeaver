import type { MessageWindowTarget } from "@orb/contracts/search";
import type { ChatId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";

interface ChatMoment {
  readonly chatId: ChatId;
  readonly target: MessageWindowTarget;
  readonly request: number;
  readonly consumed: boolean;
}
interface ChatMomentState {
  readonly moment: ChatMoment | null;
  readonly sequence: number;
}
const useChatMomentStore = createGatedStore<ChatMomentState>("chat-moment", () => ({ moment: null, sequence: 0 }));

/** The request survives query suspension; consumption waits for the target row's rendered focus. */
export function requestChatMoment(chatId: ChatId, target: MessageWindowTarget): void {
  const request = useChatMomentStore.getState().sequence + 1;
  useChatMomentStore.setState({ sequence: request, moment: { chatId, target, request, consumed: false } }, false, "chat-moment/request");
}
export function consumeChatMoment(request: number): void {
  const moment = useChatMomentStore.getState().moment;
  if (moment?.request === request) {
    useChatMomentStore.setState({ moment: { ...moment, consumed: true } }, false, "chat-moment/consume");
  }
}
export function clearChatMoment(): void {
  useChatMomentStore.setState({ moment: null }, false, "chat-moment/clear");
}
export function useChatMoment(chatId: ChatId | null): ChatMoment | null {
  return useChatMomentStore((state) => (state.moment?.chatId === chatId ? state.moment : null));
}
