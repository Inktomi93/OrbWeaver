// The two chatStream WRITE call sites outside the reducer itself — both owned here so `#state`'s
// chatStream import stays inside data/bus/ (gate `chat-stream-writes-in-bus-only`, UI-Gates §11.1).
// `useChatBusDeps` assembles the composition root's ChatBusDeps (stream + the central invalidate);
// `markTurnStopping` is the composer's Stop-button optimistic transition — see chat-stream.ts's
// "write ownership" note: every chatStream action but markStopping is bus-only, and this wrapper is
// how a feature reaches it without importing chatStream directly.

import type { ChatId } from "@orb/kit/ids";
import { chatStream } from "#state";
import { useInvalidation } from "../use-invalidation.ts";
import type { ChatBusDeps } from "./apply-chat-bus-event.ts";

/** Assemble the composition root's ChatBusDeps — `stream` is the chatStream write API, `invalidate`
 *  is the central seam's bus half. */
export function useChatBusDeps(): ChatBusDeps {
  const invalidation = useInvalidation();
  return { stream: chatStream, invalidate: invalidation.invalidate };
}

/** The Stop button's instant "stopping" feedback, fired before the abort round-trip starts (see
 *  chat-stream.ts's `markStopping` doc). Not a hook — called inside an event handler. */
export function markTurnStopping(chatId: ChatId): "pending" | "streaming" | null {
  return chatStream.markStopping(chatId);
}

/** Roll back only the client-owned stopping transition after chat.abort rejects. A server terminal that
 *  already won leaves a non-stopping slot and therefore wins this race. */
export function recoverTurnAfterStopFailure(chatId: ChatId, previousPhase: "pending" | "streaming"): void {
  chatStream.recoverAfterStopFailure(chatId, previousPhase);
}
