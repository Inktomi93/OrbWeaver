// Central invalidation seam: bus handlers call invalidate(event)/invalidateUser(event), mutations
// route `invalidates` filters through invalidateFilters — nothing else calls invalidateQueries
// directly (gate `no-inline-invalidate-outside-seam`).

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import { USER_BUS_EVENT_TYPES } from "@orb/contracts/user-bus";
import type { InvalidateQueryFilters, QueryClient } from "@tanstack/react-query";
import { busDupCheck, busInvalidate, IS_DEV } from "#lib";
import type { Trpc } from "./trpc";

/** What the proxy's `.queryFilter()`/`.pathFilter()` return — accepted by `invalidateQueries`. */
export type InvalidateFilter = InvalidateQueryFilters;

/** The tRPC filter's dotted path — the readable key name the `[bus]` dev log keys off. Dev-only. */
function filterKeyName(filter: InvalidateFilter): string {
  const queryKey = (filter as { readonly queryKey?: readonly unknown[] }).queryKey;
  const path = Array.isArray(queryKey) ? queryKey[0] : undefined;
  return Array.isArray(path) ? path.join(".") : "?";
}

export interface Invalidation {
  /** The bus half — routes a `ChatBusEvent` through the exhaustive map. Fire-and-forget. */
  readonly invalidate: (event: ChatBusEvent) => void;
  /** The user-bus half — routes a `UserBusEvent` through `USER_BUS_FILTERS`. Fire-and-forget. */
  readonly invalidateUser: (event: UserBusEvent) => void;
  /** Gap-heal — on user-bus (re)connect, blanket-invalidate every filter the user map covers. */
  readonly invalidateAllUserRoots: () => void;
  /** The mutation half — `createEntityMutation.onSettled` routes its filters through here. */
  readonly invalidateFilters: (filters: readonly InvalidateFilter[]) => void;
}

type BusFilterMap = {
  readonly [K in ChatBusEvent["type"]]: (event: Extract<ChatBusEvent, { type: K }>, trpc: Trpc) => readonly InvalidateFilter[];
};

const nothing = (): readonly InvalidateFilter[] => [];

// The open chat's detail reads (no chat list) — the room read, message list, and the swipe strip's
// step-target resolver.
function chatDetailReads(trpc: Trpc, chatId: ChatBusEvent["chatId"]): readonly InvalidateFilter[] {
  return [trpc.chat.getChat.queryFilter({ chatId }), trpc.chat.listMessages.pathFilter(), trpc.chat.listMessageVariants.pathFilter()];
}

// Detail reads plus the chat list, for non-terminal canon events the server fires no chatsChanged for.
function chatReads(trpc: Trpc, chatId: ChatBusEvent["chatId"]): readonly InvalidateFilter[] {
  return [...chatDetailReads(trpc, chatId), trpc.chat.listChats.pathFilter()];
}

const BUS_FILTERS: BusFilterMap = {
  delta: nothing,
  reasoningStreamDone: nothing,
  turnStarted: nothing,
  warning: nothing,
  worldInfoActivated: nothing,

  // Canon-terminal commit — open chat's detail only; the chat list/character-library recency is
  // driven by the user-bus chatsChanged fan on this same moment (avoids a triple-invalidate).
  messageCommitted: (e, trpc) => chatDetailReads(trpc, e.chatId),
  messageEdited: (e, trpc) => chatReads(trpc, e.chatId),
  messageHidden: (e, trpc) => chatReads(trpc, e.chatId),
  variantSelected: (e, trpc) => chatReads(trpc, e.chatId),
  messagesDeleted: (e, trpc) => chatReads(trpc, e.chatId),
  messagesReordered: (e, trpc) => chatReads(trpc, e.chatId),
  reasoningEdited: (e, trpc) => chatReads(trpc, e.chatId),
  reasoningCleared: (e, trpc) => chatReads(trpc, e.chatId),

  turnCompleted: (e, trpc) => chatDetailReads(trpc, e.chatId),
  turnAborted: (e, trpc) => chatReads(trpc, e.chatId),

  personaSwitched: (e, trpc) => [trpc.chat.getChat.queryFilter({ chatId: e.chatId })],

  wiBookAttached: (e, trpc) => [trpc.worldInfo.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId })],
  wiBookDetached: (e, trpc) => [trpc.worldInfo.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId })],
  wiEntryAttached: (e, trpc) => [trpc.worldInfo.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId })],
  wiEntryDetached: (e, trpc) => [trpc.worldInfo.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId })],
  wiEntryScopeChanged: (e, trpc) => [trpc.worldInfo.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId })],

  chatCreated: (_e, trpc) => [trpc.chat.listChats.pathFilter()],
  chatDeleted: (e, trpc) => chatReads(trpc, e.chatId),
  chatOpened: (e, trpc) => [trpc.chat.getChat.queryFilter({ chatId: e.chatId })],
  historyTruncated: (e, trpc) => [trpc.chat.getChat.queryFilter({ chatId: e.chatId })],
  chatUpdated: (e, trpc) => chatReads(trpc, e.chatId),
};

// Second map: the per-user bus. staleTime: Infinity means only a bus tick refetches a non-chat
// domain read; this is the freshness driver for every surface the chat bus doesn't reach. Coarse by
// design — each member path-invalidates its whole domain root.
type UserBusFilterMap = {
  readonly [K in UserBusEvent["type"]]: (event: Extract<UserBusEvent, { type: K }>, trpc: Trpc) => readonly InvalidateFilter[];
};

const USER_BUS_FILTERS: UserBusFilterMap = {
  charactersChanged: (_e, trpc) => [trpc.character.pathFilter()],
  personasChanged: (_e, trpc) => [trpc.persona.pathFilter()],
  presetsChanged: (_e, trpc) => [trpc.preset.pathFilter()],
  worldInfoChanged: (_e, trpc) => [trpc.worldInfo.pathFilter()],
  tagsChanged: (_e, trpc) => [trpc.tag.pathFilter()],
  // Themes live under the settings router but are a distinct read surface.
  themesChanged: (_e, trpc) => [trpc.settings.listThemes.pathFilter(), trpc.settings.getTheme.pathFilter()],
  // User settings only — not the app/global settings.
  settingsChanged: (_e, trpc) => [trpc.settings.getUserSettings.pathFilter()],
  credentialsChanged: (_e, trpc) => [trpc.credentials.pathFilter()],
  // The chat-list + character-library recency driver, and the sole driver on the message-commit
  // terminal path (the server fans this to every present member on both canon-commit terminals and
  // chat-list lifecycle ops). chatId present (lifecycle) also refetches that chat's getChat.
  chatsChanged: (e, trpc) =>
    e.chatId === undefined
      ? [trpc.chat.listChats.pathFilter(), trpc.character.list.pathFilter()]
      : [trpc.chat.listChats.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId }), trpc.character.list.pathFilter()],
  // Deferred member — never emitted today; the map entry is ready for when it lands.
  connectionsChanged: (_e, trpc) => [trpc.connection.pathFilter()],
};

/** Every filter the user map covers — derived so a new member can't drift the gap-heal set. */
function allUserRootFilters(trpc: Trpc): readonly InvalidateFilter[] {
  return (Object.keys(USER_BUS_EVENT_TYPES) as UserBusEvent["type"][]).flatMap((type) => {
    const handler = USER_BUS_FILTERS[type] as (e: UserBusEvent, t: Trpc) => readonly InvalidateFilter[];
    return handler({ type } as UserBusEvent, trpc);
  });
}

export function createInvalidation(deps: { readonly queryClient: QueryClient; readonly trpc: Trpc }): Invalidation {
  const invalidateFilters = (filters: readonly InvalidateFilter[]): void => {
    for (const filter of filters) {
      if (IS_DEV) {
        busDupCheck(filterKeyName(filter));
      }
      // Fire-and-forget by design: refetch failures surface on the queries' own error state.
      void deps.queryClient.invalidateQueries(filter);
    }
  };
  return {
    invalidate: (event): void => {
      const handler = BUS_FILTERS[event.type] as (e: ChatBusEvent, t: Trpc) => readonly InvalidateFilter[];
      const filters = handler(event, deps.trpc);
      if (IS_DEV) {
        busInvalidate(event.type, event.chatId, filters.map(filterKeyName));
      }
      invalidateFilters(filters);
    },
    invalidateUser: (event): void => {
      const handler = USER_BUS_FILTERS[event.type] as (e: UserBusEvent, t: Trpc) => readonly InvalidateFilter[];
      const filters = handler(event, deps.trpc);
      if (IS_DEV) {
        busInvalidate(event.type, "user", filters.map(filterKeyName));
      }
      invalidateFilters(filters);
    },
    invalidateAllUserRoots: (): void => {
      invalidateFilters(allUserRootFilters(deps.trpc));
    },
    invalidateFilters,
  };
}
