// The durable per-user INBOX reads/writes (PD-23; the multi-human invites lane) — the bell's data layer
// over the `notifications` router. All shapes are tRPC-INFERRED (`inferInput`/`inferOutput`) so a wire
// reshape breaks HERE at compile time, never a re-spelled literal (§5.5). The inferred aliases stay
// FILE-LOCAL (`no-inline-types`: a feature exports interfaces, never loose `export type` aliases —
// consumers re-derive from the same proxy).
//
// FRESHNESS: the inbox is NOT covered by the chat bus or the user bus — its driver is the router's OWN
// durable-first subscription (`notifications.notifications`, wired in `use-inbox-stream.ts`), so the two
// write verbs below carry an explicit `invalidates` (the mutation-vs-bus rule, data/invalidation.ts: keep
// `invalidates` exactly for the keys no DELIVERED bus event covers — the notifications stream is not one
// of the two mapped buses, and its onData handler only refetches on NEW arrivals, not on own writes).
//
// The bell reads ONE bounded first page (the server default limit 50, dismissed excluded, newest-first) —
// an unread badge + an actionable list, not an infinite archive (deeper history is a non-goal here).

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
  // Covered by no bus map (see the header) — the inbox read is this mutation's own key to reconcile.
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
