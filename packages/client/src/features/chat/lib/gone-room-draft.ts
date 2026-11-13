// The one leave for an open room that no longer exists, whether its own read answered not found or the bus told the session it
// was deleted. The reader returns to the chat list, and what they had not sent does not vanish unannounced: the text's entry leaves
// the draft store (a draft under a room that no longer exists can never be sent, so it would only be an orphan) and a notice says
// the chat is gone and what became of the work. Only the text is offered back, to copy; a staged file is lost with the composer
// and the notice says so. The text is held by the notice alone, so it stays until the reader dismisses it, and where the browser
// cannot copy (a page on plain http) the text itself is shown to select by hand.

import type { ChatId } from "@orb/kit/ids";
import { copyHeldText, notify } from "#lib";
import { activeChatId, chatDeletedFromList, clearComposerDraft, readComposerDraft, takePendingAttachments } from "#state";
import { CHAT_GONE_DRAFT_NOTICE, goneDraftDescription } from "./chat-surface-names.ts";

// A blank draft is not text worth a notice, and a draft with no files has nothing else to report.
function releaseGoneRoomWork(chatId: ChatId): void {
  const draft = readComposerDraft(chatId);
  const files = takePendingAttachments(chatId);
  clearComposerDraft(chatId);
  const hasText = draft.trim() !== "";
  if (!hasText && files === 0) {
    return;
  }
  notify.warn({
    title: CHAT_GONE_DRAFT_NOTICE.title,
    description: goneDraftDescription({ hasText, files }),
    // Nothing to copy, nothing to lose: a notice about files alone may expire like any other.
    ...(hasText
      ? { persistent: true, action: { label: CHAT_GONE_DRAFT_NOTICE.copyName, onClick: (): void => copyHeldText(draft, CHAT_GONE_DRAFT_NOTICE.manualTitle) } }
      : {}),
  });
}

/** Release the gone room's unsent work, then return the reader to the chat list. A deleted chat the reader is not in is no leave: it has no notice to give. */
export function leaveGoneRoom(chatId: ChatId): void {
  if (activeChatId() === chatId) {
    releaseGoneRoomWork(chatId);
  }
  chatDeletedFromList(chatId);
}
