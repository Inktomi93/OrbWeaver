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
import { useState } from "react";
import { notify } from "#lib";
import { useTRPC } from "../trpc";
import type { ChatBusDeps } from "./apply-chat-bus-event";
import { applyChatBusEvent } from "./apply-chat-bus-event";

// The FIRST-TURN RACE fix (the "draft's first send never streams" bug): a brand-new draft mounts this
// hook with `chatId === null` (skipToken — no subscription). Its first send lazily creates the chat, so
// `chatId` flips null→committed WITHIN this same mount (the surface does NOT remount — the session key is
// stable across draft→commit, active-chat-store.ts THE KEY DISCIPLINE). The server begins emitting
// `turnStarted` + head deltas the instant the subscription attaches, and a FRESH attach with no resume
// cursor only sees live-from-attach — so the head deltas race PAST the just-mounted subscription and are
// lost, `beginTurn` never fires, and the ghost never animates (the final reply still lands via the
// messageCommitted→invalidation refetch, which is why the message appears but never streamed).
//
// Fix = seed a REPLAY CURSOR (`lastEventId: "0"`) exactly for a chat that was CREATED within this
// subscription's lifetime — i.e. the null→committed transition. The server then replays THIS chat's
// durable `chat_events` from its baseline (per-token deltas ARE persisted there, verified), recovering
// whatever the live attach point missed. It is bounded to this one chat (replay is chatId-scoped — never
// prior history, never other chats) and never a blanket "replay-from-null" (an EXISTING chat opened
// directly mounts with a non-null `chatId` from render 1 — it never saw the draft-null, so it is NOT
// seeded, so a finished turn is never re-replayed / re-animated as a ghost).
//
// NOTE (deviation from the coordinator's `justCreated`-on-ChatHandle sketch, flagged): the approved
// mechanism keyed off the handle can't reach here — `MessageListSurface` receives `ChatRoomSurface`'s
// LOCAL handle (committed at chat-room-surface.tsx's own `setHandle`, default `justCreated:false`,
// outside this lane's file set), not the active-chat-store handle that `commitDraft` mutates. Detecting
// the null→committed `chatId` transition IN this hook is the same intent, self-contained, and needs no
// out-of-file-set edit. The seed decision is captured ONCE per committed chatId and frozen (the refs
// below) so a later re-render can't perturb the live subscription's input and force a re-subscribe.

/**
 * Attach the room's live event stream and reduce it into client state. Mount ONCE per open chat
 * (the chat surface); `null` detaches (no chat open). `deps` come from the composition root
 * (`main.tsx` builds them over the invalidation seam + the chat-stream store).
 */
export function useChatBus(chatId: ChatId | null, deps: ChatBusDeps): void {
  const trpc = useTRPC();
  // Freeze the replay-seed decision via the React "adjust state during render" pattern (no refs — this
  // value drives the subscription input, so it MUST be render state). `prevChatId` tracks the previous
  // render's chatId; `seededChatId` is the ONE chatId we seed — set only on a null→committed transition
  // (a just-created chat), then frozen. An existing chat mounts with `prevChatId === chatId` (no
  // transition), so it is never seeded.
  const [prevChatId, setPrevChatId] = useState<ChatId | null>(chatId);
  const [seededChatId, setSeededChatId] = useState<ChatId | null>(null);
  if (chatId !== prevChatId) {
    setPrevChatId(chatId);
    if (chatId !== null && prevChatId === null) {
      setSeededChatId(chatId); // draft → committed within this mount: seed this chat's replay.
    }
  }
  const seededForThisChat = chatId !== null && seededChatId === chatId;
  const input = subscriptionInput(chatId, seededForThisChat);
  useSubscription(
    trpc.chat.streamMessages.subscriptionOptions(input, {
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

/** The subscription input: `skipToken` for a draft (no chat), `{ chatId, lastEventId: "0" }` for a
 *  just-created chat (seed the durable replay from this chat's baseline), else a plain `{ chatId }`. */
function subscriptionInput(
  chatId: ChatId | null,
  seeded: boolean,
): typeof skipToken | { readonly chatId: ChatId; readonly lastEventId?: string } {
  if (chatId === null) {
    return skipToken;
  }
  return seeded ? { chatId, lastEventId: "0" } : { chatId };
}
