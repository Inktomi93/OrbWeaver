// The CENTRAL invalidation seam (UI-Gates §11.3): neo's real sprawl was not queryKeys (100%
// proxy-derived) but INVALIDATION — 81 `invalidateQueries` across 40 files with no map. Here is the
// map: ONE exhaustive event→filters table + ONE `invalidateFilters` chokepoint. Nothing else in the
// client calls `queryClient.invalidateQueries` (gate `no-inline-invalidate-outside-seam`) — bus
// handlers call `invalidate(event)`, mutations route their `invalidates` filters through
// `invalidateFilters`. Filters are ALWAYS produced by the same tRPC proxy the readers key from
// (`.queryFilter(input)` / `.pathFilter()`), so a rename/reshape breaks HERE at compile time, never
// silently at a stale screen.
//
// The map is a mapped-type `Record` over `ChatBusEvent["type"]` (§7.5 exhaustive-dispatch): a NEW
// bus member fails `tsc` until this table says what it invalidates — "nothing" is an explicit `[]`,
// never an omission. `messageCommitted`-class events carry an optional `view` (the no-refetch
// carrier); v1 deliberately invalidates anyway (targeted-invalidate + background refetch is the
// documented model — UI-Lib-TanStack-Query.md §F-3); when the chat feature lands its read model it
// upgrades the relevant rows to `setQueryData` patches HERE, in the one chokepoint.
//
// ── THE MUTATION-VS-BUS RULE (freshness has ONE driver, not two) ──────────────────────────────────
// The bus is the freshness path (`staleTime: Infinity`; the client subscribes to the OPEN chat's stream
// — `use-chat-bus.ts` — and every canon change on that chat emits a `ChatBusEvent` that runs its filters
// above). So a chat mutation whose server verb emits such an event on the chat you're viewing must NOT
// ALSO invalidate the keys that event covers: `invalidates: () => []`. Doing both double-refetched the
// SAME keys (a send fired getChat/listMessages/listChats 4-5× — the observed storm). Verified by the
// exhaustive contract test (tests/client/data/invalidation.test.ts). A mutation KEEPS an `invalidates`
// entry ONLY for a key NO delivered bus event covers — i.e.:
//   • it acts on a DIFFERENT chat than the one subscribed (chat-row rename/star/archive/delete, and
//     startChat/forkChat which create a chat you're not yet subscribed to → keep `listChats`); or
//   • it invalidates a read no `chatReads`/`chatUpdated` covers (e.g. `listChatInjections`).
// The reducer (`apply-chat-bus-event.ts`) + this map are BOTH exhaustive, so "which event a verb emits"
// is the only per-mutation fact to check; the audit table lives in the mutation files' own headers.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { InvalidateQueryFilters, QueryClient } from "@tanstack/react-query";
import type { Trpc } from "./trpc";

/** What the proxy's `.queryFilter()`/`.pathFilter()` return — accepted by `invalidateQueries`. */
export type InvalidateFilter = InvalidateQueryFilters;

export interface Invalidation {
  /** The bus half — routes a `ChatBusEvent` through the exhaustive map. Fire-and-forget. */
  readonly invalidate: (event: ChatBusEvent) => void;
  /** The mutation half — `createEntityMutation.onSettled` routes its filters through here. */
  readonly invalidateFilters: (filters: readonly InvalidateFilter[]) => void;
}

type BusFilterMap = {
  readonly [K in ChatBusEvent["type"]]: (
    event: Extract<ChatBusEvent, { type: K }>,
    trpc: Trpc,
  ) => readonly InvalidateFilter[];
};

// Shared shapes, named once.
const nothing = (): readonly InvalidateFilter[] => [];

function chatReads(trpc: Trpc, chatId: ChatBusEvent["chatId"]): readonly InvalidateFilter[] {
  // The room read + the message list + the chat list (recency/preview all move on any canon change).
  // Cheap + precise: getChat + listMessages are input-scoped to THIS chat; listChats is path-scoped.
  // listMessages is the chat message-list surface's read (W-17); a canon mutation refetches it.
  // listMessageVariants is the swipe strip's step-target resolver (path-scoped — a swipe/select/delete may
  // touch any slot's sibling set, and the read is cheap/gated so a broad path invalidate is fine here too).
  return [
    trpc.chat.getChat.queryFilter({ chatId }),
    trpc.chat.listMessages.pathFilter(),
    trpc.chat.listMessageVariants.pathFilter(),
    trpc.chat.listChats.pathFilter(),
  ];
}

const BUS_FILTERS: BusFilterMap = {
  // Stream-transient — the chat-stream store owns these; no read model changes until terminal.
  delta: nothing,
  reasoningStreamDone: nothing,
  turnStarted: nothing,
  warning: nothing,
  worldInfoActivated: nothing, // per-turn trace (automation trigger) — no query reads it

  // Canon mutations — refetch the room + the list.
  messageCommitted: (e, trpc) => chatReads(trpc, e.chatId),
  messageEdited: (e, trpc) => chatReads(trpc, e.chatId),
  messageHidden: (e, trpc) => chatReads(trpc, e.chatId),
  variantSelected: (e, trpc) => chatReads(trpc, e.chatId),
  messagesDeleted: (e, trpc) => chatReads(trpc, e.chatId),
  messagesReordered: (e, trpc) => chatReads(trpc, e.chatId),
  reasoningEdited: (e, trpc) => chatReads(trpc, e.chatId),
  reasoningCleared: (e, trpc) => chatReads(trpc, e.chatId),

  // Turn terminals — completion commits canon; an abort may still have committed a partial.
  turnCompleted: (e, trpc) => chatReads(trpc, e.chatId),
  turnAborted: (e, trpc) => chatReads(trpc, e.chatId),

  personaSwitched: (e, trpc) => [trpc.chat.getChat.queryFilter({ chatId: e.chatId })],

  // World-info attachment changes — WI reads + the room (assembly pool changed).
  wiBookAttached: (e, trpc) => [
    trpc.worldInfo.pathFilter(),
    trpc.chat.getChat.queryFilter({ chatId: e.chatId }),
  ],
  wiBookDetached: (e, trpc) => [
    trpc.worldInfo.pathFilter(),
    trpc.chat.getChat.queryFilter({ chatId: e.chatId }),
  ],
  wiEntryAttached: (e, trpc) => [
    trpc.worldInfo.pathFilter(),
    trpc.chat.getChat.queryFilter({ chatId: e.chatId }),
  ],
  wiEntryDetached: (e, trpc) => [
    trpc.worldInfo.pathFilter(),
    trpc.chat.getChat.queryFilter({ chatId: e.chatId }),
  ],
  wiEntryScopeChanged: (e, trpc) => [
    trpc.worldInfo.pathFilter(),
    trpc.chat.getChat.queryFilter({ chatId: e.chatId }),
  ],

  // Chat-row lifecycle.
  chatCreated: (_e, trpc) => [trpc.chat.listChats.pathFilter()],
  chatDeleted: (e, trpc) => chatReads(trpc, e.chatId),
  chatOpened: (e, trpc) => [trpc.chat.getChat.queryFilter({ chatId: e.chatId })],
  historyTruncated: (e, trpc) => [trpc.chat.getChat.queryFilter({ chatId: e.chatId })],
  chatUpdated: (e, trpc) => chatReads(trpc, e.chatId),
};

export function createInvalidation(deps: {
  readonly queryClient: QueryClient;
  readonly trpc: Trpc;
}): Invalidation {
  const invalidateFilters = (filters: readonly InvalidateFilter[]): void => {
    for (const filter of filters) {
      // Fire-and-forget by design: refetch failures surface on the queries' own error state.
      void deps.queryClient.invalidateQueries(filter);
    }
  };
  return {
    invalidate: (event): void => {
      // The indexed dispatch is total (BusFilterMap is a mapped type over the union); the cast
      // narrows the handler's event param back from the union member the index erased.
      const handler = BUS_FILTERS[event.type] as (
        e: ChatBusEvent,
        t: Trpc,
      ) => readonly InvalidateFilter[];
      invalidateFilters(handler(event, deps.trpc));
    },
    invalidateFilters,
  };
}
