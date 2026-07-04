// The bus TRANSPORT adapter (UI-Gates §11.1: "the hook is a thin transport adapter") — subscribes
// `chat.streamMessages` (SSE via httpSubscriptionLink; every server yield is `tracked()`, so the
// envelope is `{ id, data }` and lastEventId/replay/resume ride tRPC's own machinery) and forwards
// EVERY event into the pure reducer. The subscription body contains NOTHING else (gate
// `no-inline-cache-surgery-in-stream`): no cache writes, no store writes, no branching beyond the
// envelope unwrap — reduction is all `applyChatBusEvent`'s job. `withSubscriptionErrors`
// (transport) converts a server-side domain error into a TYPED TERMINAL FRAME
// (`{ __subscriptionError: true, code, message }`) instead of a spurious 500 — the adapter routes
// that frame to the notify seam, never into the reducer.

import type { ChatId } from "@orb/kit/ids";
import { skipToken } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { notify } from "#lib";
import { useTRPC } from "../trpc";
import type { ChatBusDeps } from "./apply-chat-bus-event";
import { applyChatBusEvent } from "./apply-chat-bus-event";

/**
 * Attach the room's live event stream and reduce it into client state. Mount ONCE per open chat
 * (the chat surface); `null` detaches (no chat open). `deps` come from the composition root
 * (`main.tsx` builds them over the invalidation seam + the chat-stream store).
 */
export function useChatBus(chatId: ChatId | null, deps: ChatBusDeps): void {
  const trpc = useTRPC();
  useSubscription(
    trpc.chat.streamMessages.subscriptionOptions(chatId === null ? skipToken : { chatId }, {
      onData: (envelope) => {
        const event = envelope.data;
        if ("__subscriptionError" in event) {
          // The typed terminal frame — a domain error ended the stream; refetch-on-reconnect
          // (query-client.ts) catches the gap when the client re-subscribes.
          notify.error(event.message);
          return;
        }
        applyChatBusEvent(event, deps);
      },
    }),
  );
}
