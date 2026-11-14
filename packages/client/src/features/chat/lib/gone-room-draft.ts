// The one leave for an open room that no longer exists, whether its own read answered not found or the bus told the session it
// was deleted. The reader returns to the chat list, and what they had not sent does not vanish unannounced: the text's entry leaves
// the draft store (a draft under a room that no longer exists can never be sent, so it would only be an orphan) and a notice says
// the chat is gone and what became of the work. Only the text is offered back, to copy; a staged file is lost with the composer
// and the notice says so. The text is held by the notice alone, so it stays until the reader dismisses it, and where the browser
// cannot copy (a page on plain http) the text itself is shown to select by hand. A chat the reader deletes themselves releases the same
// entries without the notice: they confirmed the delete.

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

// Chats whose delete the reader sent and has not yet heard answered. The bus's `chatDeleted` can reach `leaveGoneRoom` before the
// request's own success does, and a marked id is that same delete, not another session's. A mark lasts only as long as its request.
const selfDeleting = new Set<ChatId>();

/** Release the gone room's unsent work, then return the reader to the chat list. A deleted chat the reader is not in is no leave: it has no notice to give. A chat the reader is deleting themselves has no notice either. */
export function leaveGoneRoom(chatId: ChatId): void {
  if (selfDeleting.has(chatId)) {
    forgetDeletedChat(chatId);
    return;
  }
  if (activeChatId() === chatId) {
    releaseGoneRoomWork(chatId);
  }
  chatDeletedFromList(chatId);
}

// A chat the reader just deleted, from its list row or its own room: the delete was confirmed on screen, so its draft entry and staged
// files leave with it and nothing is offered back. Then the reader returns to the chat list if the chat was open.
function forgetDeletedChat(chatId: ChatId): void {
  takePendingAttachments(chatId);
  clearComposerDraft(chatId);
  chatDeletedFromList(chatId);
}

/** Send the reader's confirmed delete of `chatId`. The chat is marked before the request leaves, so the bus's own deleted event cannot
 *  be taken for another session's; the mark is dropped once the request settles, so a failed delete leaves a later delete by someone
 *  else to raise its notice. The mutation's own error notice owns a failure. */
export function deleteOwnChat(chatId: ChatId, remove: () => Promise<unknown>): void {
  selfDeleting.add(chatId);
  remove()
    .then(
      (): void => forgetDeletedChat(chatId),
      () => undefined,
    )
    .finally((): void => {
      selfDeleting.delete(chatId);
    });
}
