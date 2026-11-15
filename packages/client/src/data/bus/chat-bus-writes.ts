// The chatStream WRITE call sites outside the reducer itself — all owned here so `#state`'s
// chatStream import stays inside data/bus/ (lint rule `orb/chat-stream-writes-in-bus-only`, UI-Gates §11.1).
// `useChatBusDeps` assembles the composition root's ChatBusDeps (stream + the central invalidate);
// `markTurnStopping` is the composer's Stop-button optimistic transition and `releaseGhostHandover` the
// transcript's release of a closed turn's held ghost — see chat-stream.ts's "write ownership" note: these
// wrappers are how a feature reaches those actions without importing chatStream directly.

import type { ChatId, MessageId } from "@orb/kit/ids";
import { hashKey, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { chatStream, heldGhostMessageId } from "#state";
import { useTRPC } from "../trpc.ts";
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

/** The transcript's word that it now shows a closed turn's committed row, so the held ghost stands down for good.
 *  Called from an effect after the render that showed the row. */
export function releaseGhostHandover(chatId: ChatId, messageId: MessageId): void {
  chatStream.releaseHandover(chatId, messageId);
}

/**
 * Release a closed turn's held ghost when a read of the room's tail that began while it was held comes back without
 * its row: the server no longer has that row at the tail, so no later render will show it and the hold would never end.
 * A read already in flight when the hold began is not trusted, since it may predate the commit.
 */
export function useHandoverReadRelease(chatId: ChatId): void {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  useEffect(() => {
    const tailKey = trpc.chat.listMessages.queryKey({ chatId });
    const tailHash = hashKey(tailKey);
    let heldAtStart: MessageId | null = null;
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.query.queryHash !== tailHash) {
        return;
      }
      if (event.action.type === "fetch") {
        heldAtStart = heldGhostMessageId(chatId);
        return;
      }
      // A manual success is a cache patch, not a read.
      if (event.action.type !== "success" || event.action.manual === true) {
        return;
      }
      const held = heldAtStart;
      heldAtStart = null;
      if (held !== null && queryClient.getQueryData(tailKey)?.messages.some((message) => message.id === held) === false) {
        chatStream.releaseHandover(chatId, held);
      }
    });
  }, [queryClient, trpc, chatId]);
}
