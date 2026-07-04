// `isContinueEligible` — the composer's continue-on-empty-send predicate (scout §"composer"): hitting
// Send with an empty draft continues the transcript from where it left off, but ONLY when the tail
// message is an assistant turn (an empty send after a USER turn is just a no-op — nothing to
// continue). Pure + DOM-free (Spine-Testing.md §7 — extract logic like this to a function over
// reaching for a browser), so it gets a `.test.ts`, not a CT.
//
// MISSING-API (flagged, same posture as `swipe-strip.tsx`'s `selectVariant` gap): the domain verb this
// would fire (`ChatService.continueTurn`, `domain/chat/verbs/turn.ts createContinueTurn`) exists but is
// NOT exposed on the tRPC chat router (swept via `sg`/grep — only startChat/listChats/getChat/
// listMessages/send/swipe/generateImage/abort/streamMessages are wired). This predicate is real,
// tested groundwork; the composer keeps Send disabled on an empty draft until `chat.continueTurn`
// lands on the transport and a future task wires the actual call.

import type { MessageRole } from "@orb/kit/message-role";

export function isContinueEligible(tailRole: MessageRole | null): boolean {
  return tailRole === "assistant";
}
