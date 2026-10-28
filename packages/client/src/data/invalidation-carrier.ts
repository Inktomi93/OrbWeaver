// The no-refetch CARRIER half of the chat invalidation seam — the third sibling of the split
// (`invalidation.ts` = which event stales what · `invalidation-reads.ts` = which reads those are · here =
// what an event WRITES on its way through). Lives in `data/` because that is the one place imperative cache
// calls are legal (`orb/client-cache-surgery-only-in-data`), and beside its dispatch because the two are one
// decision: the refetch and the patch are made on the same event, in that order.
//
// Every canon event that moves ONE row carries the fresh `MessageView` the server just committed — the
// contract names the field exactly that: "Canon mutations (view = the no-refetch carrier; absent only if
// the row raced a delete)" (`@orb/contracts/chat` bus.ts). The seam used to REFETCH on those events and
// never APPLY the carrier, so the room rendered the PRE-event row for the whole round trip.
//
// That window is the measured tail flash (`domain/chat/verbs/turn.ts` FLAG[aux-turns-have-no-accept]):
// `turnCompleted` closes the client turn slot SYNCHRONOUSLY, so the ghost row — which is holding the
// finished text — unmounts while `listMessages` is still in flight, and the OLD variant repaints for
// 100-400 ms on every turn. The carrier lands on `messageCommitted`, which the engine emits immediately
// BEFORE `turnCompleted` (engine.ts: commitGeneration → emit messageCommitted, then emit turnCompleted), so
// applying it makes the canon list correct at the instant the slot closes — no wire wait, and the
// ghost→canon handover is a same-bytes swap (`use-message-items.ts` drops the ghost on the same signal).
//
// CARRIER COMPLETENESS (why this may stand in for the read): the view is the domain's own `loadMessageView`
// row — the SAME projection `listMessages` returns — and the bus fan runs it through the SAME member strip
// the read does (`substrate/member-visibility.ts` VIEW_EVENT_TYPES), so it is byte-for-byte what a refetch
// of that row would hand this viewer.
//
// THE REFETCH STILL FIRES, deliberately: this patches ONE ROW, while the page also carries `identities` (D137 — a
// first-time speaker's portrait/name entry) and the rest of the window. The wire read stays authoritative;
// the patch only removes the interval in which the cache is KNOWABLY stale.

import type { ChatBusEvent, MessageView } from "@orb/contracts/chat";
import type { QueryClient } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "./trpc.ts";

interface PendingCanonQueue {
  readonly views: Map<string, () => void>;
  readonly unsubscribe: () => void;
}

const pendingCanonByClient = new WeakMap<QueryClient, Map<string, PendingCanonQueue>>();

function removePendingQueue(queryClient: QueryClient, queryHash: string): PendingCanonQueue | undefined {
  const clientQueues = pendingCanonByClient.get(queryClient);
  const queue = clientQueues?.get(queryHash);
  if (queue === undefined) {
    return;
  }
  clientQueues?.delete(queryHash);
  queue.unsubscribe();
  if (clientQueues?.size === 0) {
    pendingCanonByClient.delete(queryClient);
  }
  return queue;
}

function queueUntilInitialRead(queryClient: QueryClient, queryHash: string, view: MessageView, apply: () => void): void {
  // `getOrInsertComputed` is not in the browser floor (Chrome 145, Firefox 144, Safari 26.2).
  const clientQueues = pendingCanonByClient.get(queryClient) ?? new Map<string, PendingCanonQueue>();
  pendingCanonByClient.set(queryClient, clientQueues);
  let queue = clientQueues.get(queryHash);
  if (queue === undefined) {
    const views = new Map<string, () => void>();
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.query.queryHash !== queryHash) {
        return;
      }
      if (event.type === "removed") {
        removePendingQueue(queryClient, queryHash);
        return;
      }
      if (event.query.state.data === undefined) {
        return;
      }
      const ready = removePendingQueue(queryClient, queryHash);
      if (ready === undefined) {
        return;
      }
      for (const patch of ready.views.values()) {
        patch();
      }
    });
    queue = { views, unsubscribe };
    clientQueues.set(queryHash, queue);
  }
  // Multiple carriers for one row can arrive before the initial read. Only the newest view is canon.
  queue.views.set(view.id, apply);
}

type CanonPage = inferOutput<Trpc["chat"]["listMessages"]>;

function reconcilePage(page: CanonPage, event: ChatBusEvent, append: boolean): CanonPage {
  if (event.type === "messagesDeleted") {
    return { ...page, messages: page.messages.filter((message) => !event.messageIds.includes(message.id)) };
  }
  if (!("view" in event)) {
    return page;
  }
  const view = event.view;
  const cachedView = { ...view, toolCalls: [...view.toolCalls] };
  const index = page.messages.findIndex((message) => message.id === view.id);
  if (index === -1) {
    const lastSeq = page.messages.at(-1)?.seq;
    return append && (lastSeq === undefined || view.seq >= lastSeq) ? { ...page, messages: [...page.messages, cachedView] } : page;
  }
  const messages = [...page.messages];
  messages[index] = cachedView;
  return { ...page, messages };
}

function applyCachedChange(queryClient: QueryClient, trpc: Trpc, event: ChatBusEvent): boolean {
  const key = trpc.chat.listMessages.queryKey({ chatId: event.chatId });
  const cached = queryClient.getQueryData(key) !== undefined;
  if (cached) {
    queryClient.setQueryData(key, (page) => (page === undefined ? page : reconcilePage(page, event, true)));
  }
  const historyKey = trpc.chat.listMessages.infiniteQueryKey({ chatId: event.chatId });
  if (queryClient.getQueryData(historyKey) !== undefined) {
    queryClient.setQueryData(historyKey, (history) =>
      history === undefined
        ? history
        : {
            ...history,
            pages: history.pages.map((page, index) => reconcilePage(page, event, index === history.pages.length - 1)),
          },
    );
  }
  return cached;
}

/** Reconcile canon views and removals before the authoritative refresh, across tail and loaded history.
 *  Views are written to the room's TAIL page key
 *  (`{ chatId }` — composer readers and ordinary history both consume this finite tail, with its carrier
 *  taking precedence over overlapping paged rows): replace-by-id, or append at the tail for a row the page has
 *  never seen (a fresh reply / the caller's own just-sent user row). A carrier that beats the open room's
 *  initial read queues until that read lands; a background room with no query still gains no phantom list. */
export function applyCanonView(queryClient: QueryClient, trpc: Trpc, event: ChatBusEvent): void {
  if (event.type === "messagesDeleted") {
    applyCachedChange(queryClient, trpc, event);
    const key = trpc.chat.listMessages.queryKey({ chatId: event.chatId });
    const query = queryClient.getQueryCache().find({ queryKey: key, exact: true });
    const pending = query === undefined ? undefined : pendingCanonByClient.get(queryClient)?.get(query.queryHash);
    for (const id of event.messageIds) {
      pending?.views.delete(id);
    }
    return;
  }
  if (!("view" in event)) {
    return;
  }
  const view = event.view;
  if (applyCachedChange(queryClient, trpc, event)) {
    return;
  }
  const key = trpc.chat.listMessages.queryKey({ chatId: event.chatId });
  const query = queryClient.getQueryCache().find({ queryKey: key, exact: true });
  if (query?.state.fetchStatus !== "fetching") {
    return;
  }
  queueUntilInitialRead(queryClient, query.queryHash, view, (): void => {
    applyCachedChange(queryClient, trpc, event);
  });
}
