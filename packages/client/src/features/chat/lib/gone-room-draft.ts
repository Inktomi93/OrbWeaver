// The one leave for an open room that no longer exists, whether its own read answered not found or the bus told the session it
// was deleted. The reader returns to the chat list, and the unsent text they typed does not vanish unannounced: its entry leaves
// the draft store (a draft under a room that no longer exists can never be sent, so it would only be an orphan) and a notice says
// the chat is gone and offers the text back to copy. The notice holds the only remaining copy, so a reader who ignores it loses the text.

import type { ChatId } from "@orb/kit/ids";
import { copyWithNotice, notify } from "#lib";
import { activeChatId, chatDeletedFromList, clearComposerDraft, readComposerDraft } from "#state";
import { CHAT_GONE_DRAFT_NOTICE } from "./chat-surface-names.ts";

// A blank draft is not text worth a notice.
function releaseGoneRoomDraft(chatId: ChatId): void {
  const draft = readComposerDraft(chatId);
  clearComposerDraft(chatId);
  if (draft.trim() === "") {
    return;
  }
  notify.warn({
    title: CHAT_GONE_DRAFT_NOTICE.title,
    description: CHAT_GONE_DRAFT_NOTICE.description,
    action: { label: CHAT_GONE_DRAFT_NOTICE.copyName, onClick: (): void => copyWithNotice(draft, CHAT_GONE_DRAFT_NOTICE.copyFallback) },
  });
}

/** Release the gone room's draft, then return the reader to the chat list. A deleted chat the reader is not in is no leave: it has no notice to give. */
export function leaveGoneRoom(chatId: ChatId): void {
  if (activeChatId() === chatId) {
    releaseGoneRoomDraft(chatId);
  }
  chatDeletedFromList(chatId);
}
