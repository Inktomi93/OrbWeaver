// The bus transport adapter — subscribes chat.streamMessages (SSE) and forwards every event into the
// pure reducer. The subscription body contains nothing else: no cache writes, no store writes, no
// branching beyond the envelope unwrap. A server-side domain error arrives as a typed terminal frame
// (`{ __subscriptionError: true, code, message }`) instead of a spurious 500; the adapter routes that
// frame to the notify seam, never into the reducer.
//
// MONOTONIC-SEQ GUARD (the stuck-"Stop generating" P1): every durable-log yield is a tracked envelope
// carrying the durable per-chat `seq` as `envelope.id`. On the draft→committed promotion path the
// subscription attaches with the `lastEventId:"0"` seed (see below), so ANY subscription churn re-REPLAYS
// the whole durable log FROM ZERO, and a re-replayed `turnStarted` re-opens an already-terminal slot →
// stuck Stop. The one process `seqGuard` drops every durable-log event that does not advance its chat's
// high-water mark, making delivery exactly-once (full rationale + the chatOpened/historyTruncated
// EXEMPTION-BY-TYPE in `chat-event-seq-guard.ts`). tRPC's own reconnect resumes from its last tracked id,
// so a real gap-fill (seq beyond the mark) is unaffected.

import type { ChatId } from "@orb/kit/ids";
import { skipToken } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useEffect, useState } from "react";
import { busSubscribe, busUnsubscribe, notify } from "#lib";
import { useTRPC } from "../trpc";
import type { ChatBusDeps } from "./apply-chat-bus-event";
import { applyChatBusEvent } from "./apply-chat-bus-event";
import { createChatEventSeqGuard } from "./chat-event-seq-guard";

// ONE process guard shared across every (possibly concurrent) chat subscription — a monotonic cursor, not
// slot state, so it lives here and not in the store.
const seqGuard = createChatEventSeqGuard();

// The first-turn race fix: a brand-new draft mounts this hook with chatId === null (no subscription).
// Its first send lazily creates the chat, so chatId flips null→committed within this same mount. A
// fresh attach with no resume cursor only sees live-from-attach, so the head deltas race past the
// just-mounted subscription and are lost. Fix: seed a replay cursor (lastEventId: "0") exactly for a
// chat created within this subscription's lifetime, so the server replays this chat's durable events
// from baseline. Bounded to this one chat — an existing chat opened directly is never seeded.

/** Attach the room's live event stream and reduce it into client state. Mount once per open chat;
 *  `null` detaches. */
export function useChatBus(chatId: ChatId | null, deps: ChatBusDeps): void {
  const trpc = useTRPC();
  // Freeze the replay-seed decision via the "adjust state during render" pattern — this value drives
  // the subscription input, so it must be render state, not a ref. seededChatId is set only on a
  // null→committed transition, then frozen.
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
  // [bus] dev log — mirrors the subscription's own lifecycle (same deps as tRPC's internal effect).
  useEffect((): (() => void) | undefined => {
    if (chatId === null) {
      return;
    }
    busSubscribe(chatId, seededForThisChat);
    return (): void => busUnsubscribe(chatId);
  }, [chatId, seededForThisChat]);
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
        // Drop a stale re-delivery (a from-zero replay on re-attach) before it reaches the reducer — a
        // re-replayed terminal/turnStarted would otherwise re-open a completed slot (see the header note).
        // Attach-synthesized signals (chatOpened/historyTruncated) are exempt BY TYPE inside the guard.
        if (!seqGuard.admit(event, envelope.id)) {
          return;
        }
        applyChatBusEvent(event, deps);
      },
    }),
  );
}

/** The subscription input: `skipToken` for a draft (no chat), `{ chatId, lastEventId: "0" }` for a
 *  just-created chat (seed the durable replay from this chat's baseline), else a plain `{ chatId }`. */
function subscriptionInput(chatId: ChatId | null, seeded: boolean): typeof skipToken | { readonly chatId: ChatId; readonly lastEventId?: string } {
  if (chatId === null) {
    return skipToken;
  }
  return seeded ? { chatId, lastEventId: "0" } : { chatId };
}
