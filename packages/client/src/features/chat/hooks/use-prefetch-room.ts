// `usePrefetchRoom` — WARM the room's ROSTER read, from the surface that offers the door into it. The
// WARMING flavour of the repo's one typed prefetch channel (`queryClient.ensureQueryData` in an effect —
// `data/use-display-scripts.ts` states the idiom and why `usePrefetchQuery` is unusable with tRPC's
// `queryOptions()` output; `data/use-open-refinery.ts` is the DECIDING flavour).
//
// WHY (#1126, side-eye HOME 2026-09-02 H13). Home's hearth island is the surface's ONE focal action, and
// "Resume" was measured at ~600ms of crunch — ~240ms of nothing, ~360ms of skeleton, then text — plus a
// 52px jump. The jump is a COLD READ, not a layout defect: `ChatCharacterBar` reads `chat.getChat`
// NON-suspending, deliberately (its own header: the strip is decoration and must never block the
// transcript), so it renders `null` until that read lands and then appears, pushing the transcript down by
// its own 40px plus the room stack's 12px gap. Measured live: the first Resume records
// `[cls] … moved 0px,52px · observed 0.0454`, and a SECOND Resume in the same browser lifetime —
// identical click, warm cache — records no shift at all.
//
// So the fix is not to move the READ and not to reserve a box whose height is a function of the roster
// (a reservation would trade the shift for an empty band in every solo room). It is to start the FETCH at
// the door, one human-reaction-time ahead of the click, which is exactly the #514 shape.
//
// ── THE ROSTER READ ONLY (owner ruling 2026-09-02, live; do not re-widen this) ───────────────────────
// The room's SUSPENDING pair is `chat.listMessages` + `chat.getChat` (`message-list-surface.tsx`'s
// `ChatThread`), so warming BOTH also retires the skeleton phase — and that arm was built, measured and
// REFUSED. What it bought and what it cost, three warm samples per arm on one isolated stage band, same
// db, same room (`perf-meter / --click '[data-home-hearth]'`):
//   · aggregate blocking around the interaction ROUGHLY HALVED — the click's own step 150/329/315ms plus
//     809ms in motion-audit's following 2.5s window, against 595/608/410ms plus 9ms.
//   · but the transcript render MOVED INTO THE CLICK STEP: rafGap 217/333/383ms → 467/700/683ms, click
//     duration 40ms → 56/72/136ms. The user stops watching skeletons and starts watching ONE longer
//     blocked frame.
// The owner ruled for the snappy click: kill the 52px jump, keep the skeleton phase. `chat.listMessages`
// is therefore NOT warmed here, and re-adding it is a product decision, not a perf tidy-up.
//
// ONE ROOM, THE ONE YOU ARE ABOUT TO OPEN. The caller passes the hero's id and nothing else: warming the
// also-open list would spend home's own connection budget on eight rooms to win one of them.
//
// The key is the tRPC proxy's own (`trpc.chat.getChat.queryOptions({ chatId })`), byte-identical to the
// spelling `ChatCharacterBar` and `ChatThread` read through — a prefetch that warms the wrong key is
// INVISIBLE, so the shared spelling is the whole safety story.

import type { ChatId } from "@orb/kit/ids";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTRPC } from "#data";

/**
 * Warm the room's roster read for `chatId`. `null` warms nothing — the caller's surface has no room to
 * offer (an empty hearth), and a nullable key could only warm an entry nobody reads.
 *
 * Fire-and-forget: nobody awaits this and a rejection is DROPPED here, because the consumers inside the
 * room are ordinary reads that refetch and surface their own errors through `QueryBoundary` exactly as
 * they did before this existed.
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
  }, [queryClient, trpc, chatId]);
}
