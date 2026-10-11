// Where Back from a room returns: the section the room was opened from (when it was not Chats), and the
// room Back last left so its row can take focus and a mark. Page-lifetime facts, never persisted: a reload
// reopens the persisted room with Back going to its own list.

import type { ChatId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";
import type { SectionId } from "./section-ids.ts";

interface ReturnedChat {
  readonly chatId: ChatId;
  /** The row has not taken focus yet. One row consumes it, so a row mounting later never steals focus. */
  readonly focusPending: boolean;
}

interface ChatReturnState {
  readonly origin: SectionId | null;
  readonly returned: ReturnedChat | null;
}

const useChatReturnStore = createGatedStore<ChatReturnState>("chat-return", () => ({ origin: null, returned: null }));

/** Remember the section a room is being opened from. */
export function noteChatOrigin(origin: SectionId | null): void {
  useChatReturnStore.setState({ origin }, false, "chat-return/noteOrigin");
}

/** A different room opens: the previous origin and return mark no longer apply. */
export function clearChatReturn(): void {
  useChatReturnStore.setState({ origin: null, returned: null }, false, "chat-return/clear");
}

/** Back left `chatId`: mark its row and spend the origin. */
export function markChatReturned(chatId: ChatId): void {
  useChatReturnStore.setState({ origin: null, returned: { chatId, focusPending: true } }, false, "chat-return/returned");
}

/** Spend the focus claim. Any section change spends it too: a row that mounts after the user has moved on must
 *  not take focus. */
export function consumeReturnFocus(): void {
  const { returned } = useChatReturnStore.getState();
  if (returned?.focusPending === true) {
    useChatReturnStore.setState({ returned: { ...returned, focusPending: false } }, false, "chat-return/consumeFocus");
  }
}

/** The section Back returns to; `null` means the Chats list. Snapshot form for the section selection seam. */
export function chatOrigin(): SectionId | null {
  return useChatReturnStore.getState().origin;
}

export function subscribeChatOrigin(onStoreChange: () => void): () => void {
  return useChatReturnStore.subscribe((state, previous) => {
    if (state.origin !== previous.origin) {
      onStoreChange();
    }
  });
}

/** The return mark for `chatId`'s row, or `null` when Back did not just leave this room. */
export function useReturnedChat(chatId: ChatId): ReturnedChat | null {
  return useChatReturnStore((state) => (state.returned?.chatId === chatId ? state.returned : null));
}
