// The open room's read state, the one answer every part of the room surface draws from. It is derived from the room's two
// own reads: the roster (`chat.getChat`), which this hook reads, and the canon tail (`chat.listMessages`), which the transcript
// reads and this hook only observes.
//
// Only a settled, current not-found answer makes a room gone: the read's status is `error`, its fetch is idle and its code is
// NOT_FOUND. TanStack keeps a failed fetch's error beside the old data and reports it on a new observer's first result even
// while the mount's refetch is in flight, so an error with a fetch in flight is not an answer; a room that answered not found
// once and exists again (a member removed and invited back) opens. Any other failure (a 500, a network drop, an auth refusal)
// is `failed` or keeps the readable room; it never leaves.
//
// The leave runs in an effect, never in render, and it is this file's alone: a room that is gone is left for the chat list,
// where a retry could never succeed. The gone room's cached reads are dropped as it unmounts, so a later visit starts clean,
// and its unsent draft is released with a notice that offers the text back.

import type { ChatId } from "@orb/kit/ids";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import { useEffect } from "react";
import type { Trpc } from "#data";
import { forgetGoneRoom, roomRosterOptions, useTRPC } from "#data";
import { trpcErrorCode } from "#lib";
import { leaveGoneRoom } from "../lib/gone-room-draft.ts";

type RoomChat = inferOutput<Trpc["chat"]["getChat"]>;

/** What the open room may draw: a skeleton, the room, nothing while it is left, or the failure plate with its retry. */
export type RoomRead =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly chat: RoomChat }
  | { readonly kind: "gone" }
  | { readonly kind: "failed"; readonly retry: () => void };

/** The parts of a query result the verdict reads. */
interface ReadState {
  readonly status: "pending" | "error" | "success";
  readonly fetchStatus: "fetching" | "paused" | "idle";
  readonly error: unknown;
}

function settled(read: ReadState): boolean {
  return read.status === "error" && read.fetchStatus === "idle";
}

function settledNotFound(read: ReadState): boolean {
  return settled(read) && trpcErrorCode(read.error) === "NOT_FOUND";
}

function roomReadOf(roster: ReadState & { readonly data: RoomChat | undefined; readonly refetch: () => Promise<unknown> }, gone: boolean): RoomRead {
  if (gone) {
    return { kind: "gone" };
  }
  if (roster.data !== undefined) {
    return { kind: "ready", chat: roster.data };
  }
  if (settled(roster)) {
    return {
      kind: "failed",
      retry: (): void => {
        // The read's own error state carries a failed refetch; the catch owns anything else.
        roster.refetch().catch(globalThis.reportError);
      },
    };
  }
  return { kind: "loading" };
}

/** The open room's read state, and the one leave for a room whose own read answers not found. */
export function useRoomRead(chatId: ChatId): RoomRead {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const roster = useQuery(roomRosterOptions(trpc, { chatId }));
  // Observed, never fetched here: the transcript owns this read and starts it in its own render, so the two reads leave as separate
  // requests and a slow transcript never holds the roster (and the composer) behind it.
  const canon = useQuery({ ...trpc.chat.listMessages.queryOptions({ chatId }), enabled: false });
  const read = roomReadOf(roster, settledNotFound(roster) || settledNotFound(canon));
  const gone = read.kind === "gone";
  useEffect(() => {
    if (!gone) {
      return;
    }
    leaveGoneRoom(chatId);
    // The room unmounts on its way to the list, so nothing observes its reads when they are dropped.
    return (): void => forgetGoneRoom({ queryClient, trpc }, chatId);
  }, [gone, chatId, queryClient, trpc]);
  return read;
}
