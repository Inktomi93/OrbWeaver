// The durable per-user inbox reads/writes — the bell's data layer over the `notifications` router. All
// shapes are tRPC-inferred so a wire reshape breaks here at compile time. The inbox is NOT covered by
// the chat bus or the user bus — its driver is the router's own durable-first subscription
// (use-inbox-stream.ts), so the write verbs below carry an explicit `invalidates`. The bell reads one
// bounded first page (server default limit 50), not an infinite archive.

import { useQuery } from "@tanstack/react-query";
import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation, useTRPC } from "#data";

/** The `notifications.list` page — `items` are the recipient's active (undismissed) inbox rows. */
type InboxPage = inferOutput<Trpc["notifications"]["list"]>;

export interface InboxRead {
  /** The active inbox rows (newest-first), `[]` until the read lands (the bell never suspends chrome). */
  readonly items: InboxPage["items"];
  /** `readAt === null` rows — the NEW half of the bell's indicator, and the half opening the inbox clears. */
  readonly unreadCount: number;
  /** Rows still waiting on a DECISION — the pending half of the indicator (#1799). Read straight off the
   *  server's `InboxView.actionable` and never re-derived here: whether an invite is still open lives in the
   *  chat domain's own state (a share-link accept or a host revoke settles it with no inbox row changing),
   *  and a client that guessed from the row's TYPE would keep the dot lit on decisions that no longer exist.
   *  Reading the inbox does not move this number; only acting on a row does. */
  readonly pendingCount: number;
  /** The UNION of the two above — how many rows are waiting for this reader at all (#1815). A row that is
   *  both new and undecided counts ONCE, which is why it is derived here rather than added at a call site:
   *  `unreadCount + pendingCount` would double the commonest row in the inbox (a freshly-arrived invite).
   *
   *  It exists because the phone's tell is a SINGLE number for a SINGLE mark. The bell needs the halves
   *  apart (`unreadCount` is also the mark-read trigger); the You tab's badge needs the whole, and both
   *  must be one derivation over one read or the two surfaces disagree about whether anything is waiting. */
  readonly waitingCount: number;
}

/** The bell's inbox read — non-suspense (topbar chrome degrades to an empty inbox, never a fallback). */
export function useInbox(): InboxRead {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.notifications.list.queryOptions({}));
  const items = data?.items ?? [];
  return {
    items,
    unreadCount: items.filter((item) => item.readAt === null).length,
    pendingCount: items.filter((item) => item.actionable).length,
    waitingCount: items.filter((item) => item.readAt === null || item.actionable).length,
  };
}

/** Bulk "opening the bell reads everything" — ONE mutation + ONE reconcile, not a per-row loop. */
export const useMarkAllNotificationsRead = createEntityMutation<inferInput<Trpc["notifications"]["markAllRead"]>, unknown>({
  options: (trpc) => trpc.notifications.markAllRead.mutationOptions(),
  invalidates: (trpc) => [trpc.notifications.list.pathFilter()],
});

export const useDismissNotification = createEntityMutation<inferInput<Trpc["notifications"]["dismiss"]>, unknown>({
  options: (trpc) => trpc.notifications.dismiss.mutationOptions(),
  invalidates: (trpc) => [trpc.notifications.list.pathFilter()],
  errorToast: "Couldn't dismiss the notification.",
});
