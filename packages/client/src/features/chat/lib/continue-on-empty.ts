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

import type { MessageRole } from "@orb/kit/message-role";

export function isContinueEligible(tailRole: MessageRole | null): boolean {
  return tailRole === "assistant";
}
