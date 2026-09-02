// `usePrefetchRoom` — WARM the two reads a chat room SUSPENDS on, from the surface that offers the door
// into it. The WARMING flavour of the repo's one typed prefetch channel (`queryClient.ensureQueryData` in
// an effect — `data/use-display-scripts.ts` states the idiom and why `usePrefetchQuery` is unusable with
// tRPC's `queryOptions()` output; `data/use-open-refinery.ts` is the DECIDING flavour).
//
// WHY (#1126, side-eye HOME 2026-09-02 H13). Home's hearth island is the surface's ONE focal action, and
// "Resume" was measured at ~600ms of crunch: ~240ms of nothing, ~360ms of skeleton, then text — plus a
// 52px jump. Both halves are the same cold cache. `message-list-surface.tsx`'s `ChatThread` suspends on
// exactly `chat.listMessages` + `chat.getChat`, so on a cold click the room can only paint its skeleton;
// and `ChatCharacterBar` — which reads `chat.getChat` NON-suspending, deliberately (its own header: the
// strip is decoration and must never block the transcript) — renders `null` until that read lands, then
// appears and pushes the transcript down by its own 40px plus the room stack's 12px gap. Measured live:
// the first Resume records `[cls] … moved 0px,52px`, and a SECOND Resume in the same browser lifetime —
// identical click, warm cache — records no shift at all. The layout is not the defect; the cold read is.
//
// So the fix is not to move the READ and not to reserve a box whose height is a function of the roster
// (a reservation would trade the shift for an empty band in every solo room). It is to start the FETCH at
// the door, one human-reaction-time ahead of the click, which is exactly the #514 shape.
//
// ONE ROOM, THE ONE YOU ARE ABOUT TO OPEN. The caller passes the hero's id and nothing else: warming the
// also-open list would spend home's own connection budget on eight rooms to win one of them.
//
// The keys are the tRPC proxy's own (`trpc.chat.<proc>.queryOptions({ chatId })`), byte-identical to the
// spelling `ChatThread` and `ChatCharacterBar` read through — a prefetch that warms the wrong key is
// INVISIBLE, so the shared spelling is the whole safety story.

import type { ChatId } from "@orb/kit/ids";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTRPC } from "#data";

/**
 * Warm the room's suspending pair for `chatId`. `null` warms nothing — the caller's surface has no room
 * to offer (an empty hearth), and a nullable key could only warm an entry nobody reads.
 *
 * Fire-and-forget: nobody awaits this and a rejection is DROPPED here, because the consumer inside the
 * room is an ordinary suspending read that refetches and surfaces its own error through `QueryBoundary`
 * exactly as it did before this existed.
 */
export function usePrefetchRoom(chatId: ChatId | null): void {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // Rebuilt INSIDE the effect: `queryOptions()` returns a fresh object every render, so depping on it
  // would re-run this on every unrelated re-render of the surface (the `usePrefetchDisplayScripts` note).
  useEffect(() => {
    if (chatId === null) {
      return;
    }
    void queryClient.ensureQueryData(trpc.chat.getChat.queryOptions({ chatId })).catch(() => undefined);
    void queryClient.ensureQueryData(trpc.chat.listMessages.queryOptions({ chatId })).catch(() => undefined);
  }, [queryClient, trpc, chatId]);
}
