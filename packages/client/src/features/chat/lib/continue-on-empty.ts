// `isContinueEligible` — the composer's continue-on-empty-send predicate (scout §"composer"): hitting
// Send with an empty draft continues the transcript from where it left off, but ONLY when the tail
// message is an assistant turn (an empty send after a USER turn is just a no-op — nothing to
// continue). Pure + DOM-free (Spine-Testing.md §7 — extract logic like this to a function over
// reaching for a browser), so it gets a `.test.ts`, not a CT.
//
// UNWIRED (deliberate, Wave A — NOT a missing API): `chat.continueTurn` IS on the tRPC chat router
// (`routers/chat.ts`, the #27 exposure; `hooks/use-guided-actions.ts` already calls it), so the transport
// gap is closed. This predicate is real, tested groundwork; continue-on-empty stays unwired pending the
// Wave-A composer polish that acts on it (FINAL-Chats §6.4), not blocked on a missing verb.

import type { ChatId, MessageId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

export function isContinueEligible(tailRole: MessageRole | null): boolean {
  return tailRole === "assistant";
}

export interface ContinueTargetInput {
  /** The `UserSettings.chat.continueOnSend` pref — the whole feature is off when false. */
  readonly continueOnSend: boolean;
  readonly tailRole: MessageRole | null;
  /** True when the composer has sendable text — a non-empty send is a normal send, never a continue. */
  readonly hasText: boolean;
  readonly chatId: ChatId | null;
  readonly tailAssistantMessageId: MessageId | null;
}

/** The `{chatId, messageId}` an empty Send should continue, or null when continue-on-empty does not apply
 *  (pref off · non-empty draft · non-assistant tail · a draft / empty chat). Pure so the composer's send
 *  branch stays a single guarded call (Spine-Testing.md §7 — DOM-free logic gets a `.test.ts`). */
export function resolveContinueTarget(input: ContinueTargetInput): { readonly chatId: ChatId; readonly messageId: MessageId } | null {
  if (!input.continueOnSend || input.hasText || !isContinueEligible(input.tailRole)) {
    return null;
  }
  if (input.chatId === null || input.tailAssistantMessageId === null) {
    return null;
  }
  return { chatId: input.chatId, messageId: input.tailAssistantMessageId };
}
