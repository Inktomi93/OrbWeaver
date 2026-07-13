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
  /** `readAt === null` rows — the bell badge count. */
  readonly unreadCount: number;
}

/** The bell's inbox read — non-suspense (topbar chrome degrades to an empty inbox, never a fallback). */
export function useInbox(): InboxRead {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.notifications.list.queryOptions({}));
  const items = data?.items ?? [];
  return { items, unreadCount: items.filter((item) => item.readAt === null).length };
}

export const useMarkNotificationRead = createEntityMutation<
  inferInput<Trpc["notifications"]["markRead"]>,
  unknown
>({
  options: (trpc) => trpc.notifications.markRead.mutationOptions(),
  invalidates: (trpc) => [trpc.notifications.list.pathFilter()],
});

/** Bulk "opening the bell reads everything" — ONE mutation + ONE reconcile, not a per-row loop. */
export const useMarkAllNotificationsRead = createEntityMutation<
  inferInput<Trpc["notifications"]["markAllRead"]>,
  unknown
>({
  options: (trpc) => trpc.notifications.markAllRead.mutationOptions(),
  invalidates: (trpc) => [trpc.notifications.list.pathFilter()],
});

export const useDismissNotification = createEntityMutation<
  inferInput<Trpc["notifications"]["dismiss"]>,
  unknown
>({
  options: (trpc) => trpc.notifications.dismiss.mutationOptions(),
  invalidates: (trpc) => [trpc.notifications.list.pathFilter()],
  errorToast: "Couldn't dismiss the notification.",
});
