// The composer's empty-Enter classifier — what a bare Enter on an EMPTY composer does, resolved from the
// tail role + the two prefs. Two arms, pref-gated:
//   • CONTINUE (`continueOnSend`): the tail is an assistant turn → extend that reply (chat.continueTurn).
//   • GENERATE (`generateOnEmptySend`, W-E): a committed chat whose tail is NOT an assistant turn (a fresh
//     empty chat, or your own message last — the fork-at-user-tail gap) → prompt a reply (chat.generate).
// A non-empty composer is a normal send (never either arm); a DRAFT's empty Enter is a no-op (its "generate
// an opening" lives on the ▷ Response icon, which drives chat.startChat — the keyboard arm is committed-only).
// Pure + DOM-free (Spine-Testing.md §7 — extract logic like this to a function over reaching for a browser),
// so it gets a `.test.ts`, not a CT. The ▷ Response icon is the always-visible, tail-agnostic equivalent of
// both arms; this resolver is only the keyboard convenience.

import type { ChatId, MessageId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";

export function isContinueEligible(tailRole: MessageRole | null): boolean {
  return tailRole === "assistant";
}

export interface EmptySendInput {
  readonly continueOnSend: boolean;
  /** W-E — the `UserSettings.chat.generateOnEmptySend` pref; the generate arm is off when false. */
  readonly generateOnEmptySend: boolean;
  readonly tailRole: MessageRole | null;
  /** True when the composer has sendable text — a non-empty send is a normal send, never continue/generate. */
  readonly hasText: boolean;
  readonly chatId: ChatId | null;
  readonly tailAssistantMessageId: MessageId | null;
}

/** What a bare Enter on an empty composer should do. `continue` targets the tail assistant reply;
 *  `generate` prompts a fresh reply on a committed non-assistant tail (no responseNudge — a non-assistant
 *  tail is self-prompting). One union member per arm; the composer's send branch narrows on the returned
 *  value's `kind` (never imports this type), so it stays local — no cross-boundary shape, no contract home. */
type EmptySendAction =
  | { readonly kind: "continue"; readonly chatId: ChatId; readonly messageId: MessageId }
  | { readonly kind: "generate"; readonly chatId: ChatId }
  | null;

/** Classify the empty-Enter gesture: continue an assistant tail, generate on a committed non-assistant tail,
 *  or nothing. Continue wins on an assistant tail (the reply to extend is right there); generate is the
 *  fork-at-user-tail / empty-chat arm. A draft (`chatId === null`) or a non-empty composer is always null. */
export function resolveEmptySendAction(input: EmptySendInput): EmptySendAction {
  if (input.hasText || input.chatId === null) {
    return null;
  }
  if (input.continueOnSend && isContinueEligible(input.tailRole) && input.tailAssistantMessageId !== null) {
    return { kind: "continue", chatId: input.chatId, messageId: input.tailAssistantMessageId };
  }
  if (input.generateOnEmptySend && !isContinueEligible(input.tailRole)) {
    return { kind: "generate", chatId: input.chatId };
  }
  return null;
}
