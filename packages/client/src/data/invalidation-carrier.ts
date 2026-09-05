// The no-refetch CARRIER half of the chat invalidation seam — the third sibling of the split
// (`invalidation.ts` = which event stales what · `invalidation-reads.ts` = which reads those are · here =
// what an event WRITES on its way through). Lives in `data/` because that is the one place imperative cache
// calls are legal (`client-cache-surgery-only-in-data`), and beside its dispatch because the two are one
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
  let clientQueues = pendingCanonByClient.get(queryClient);
  if (clientQueues === undefined) {
    clientQueues = new Map();
    pendingCanonByClient.set(queryClient, clientQueues);
  }
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

function applyCachedView(queryClient: QueryClient, trpc: Trpc, chatId: ChatBusEvent["chatId"], view: MessageView): boolean {
  const key = trpc.chat.listMessages.queryKey({ chatId });
  if (queryClient.getQueryData(key) === undefined) {
    return false;
  }
  queryClient.setQueryData(key, (page) => {
    if (page === undefined) {
      return page;
    }
    const index = page.messages.findIndex((message) => message.id === view.id);
    if (index === -1) {
      return { ...page, messages: [...page.messages, view] };
    }
    const messages = [...page.messages];
    messages[index] = view;
    return { ...page, messages };
  });
  return true;
}

/** Apply a canon event's `view` to the open room's message list. Written to the room's TAIL page key
 *  (`{ chatId }` — the only `listMessages` key any client read uses; no caller passes `beforeSeq`, so the
 *  cached page is always the newest window): replace-by-id, or append at the tail for a row the page has
 *  never seen (a fresh reply / the caller's own just-sent user row). A carrier that beats the open room's
 *  initial read queues until that read lands; a background room with no query still gains no phantom list. */
export function applyCanonView(queryClient: QueryClient, trpc: Trpc, event: ChatBusEvent): void {
  if (!("view" in event)) {
    return;
  }
  const view = event.view;
  if (applyCachedView(queryClient, trpc, event.chatId, view)) {
    return;
  }
  const key = trpc.chat.listMessages.queryKey({ chatId: event.chatId });
  const query = queryClient.getQueryCache().find({ queryKey: key, exact: true });
  if (query?.state.fetchStatus !== "fetching") {
    return;
  }
  queueUntilInitialRead(queryClient, query.queryHash, view, (): void => {
    applyCachedView(queryClient, trpc, event.chatId, view);
  });
}
