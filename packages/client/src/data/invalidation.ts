// Central invalidation seam: bus handlers call invalidate(event)/invalidateUser(event), mutations
// route `invalidates` filters through invalidateFilters — nothing else calls invalidateQueries
// directly (gate `no-inline-invalidate-outside-seam`).

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import { USER_BUS_EVENT_TYPES } from "@orb/contracts/user-bus";
import type { ChatId } from "@orb/kit/ids";
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
  /** The rpg-bus half — routes an `RpgBusEvent` through `RPG_BUS_FILTERS` (the feature-root game bus,
   *  `rpg.stream`). Fire-and-forget. */
  readonly invalidateRpg: (event: RpgBusEvent) => void;
  /** Gap-heal — on rpg-bus (re)connect for an open game, blanket-invalidate every read that game covers. */
  readonly gapHealRpg: (chatId: ChatId) => void;
  /** Gap-heal — on user-bus (re)connect, blanket-invalidate every filter the user map covers. */
  readonly invalidateAllUserRoots: () => void;
  /** The mutation half — `createEntityMutation.onSettled` routes its filters through here. */
  readonly invalidateFilters: (filters: readonly InvalidateFilter[]) => void;
}

type BusFilterMap = {
  readonly [K in ChatBusEvent["type"]]: (event: Extract<ChatBusEvent, { type: K }>, trpc: Trpc) => readonly InvalidateFilter[];
};

const nothing = (): readonly InvalidateFilter[] => [];

// The open chat's detail reads (no chat list) — the room read, message list, the swipe strip's
// step-target resolver, and the transcript divider's present-tense fit budget (previewContextFit — the
// boundary moves when canon commits/trims, so it refetches on every canon-terminal alongside the list).
function chatDetailReads(trpc: Trpc, chatId: ChatBusEvent["chatId"]): readonly InvalidateFilter[] {
  return [
    trpc.chat.getChat.queryFilter({ chatId }),
    trpc.chat.listMessages.pathFilter(),
    trpc.chat.listMessageVariants.pathFilter(),
    trpc.chat.previewContextFit.pathFilter(),
  ];
}

// Detail reads plus the chat list, for non-terminal canon events the server fires no chatsChanged for.
function chatReads(trpc: Trpc, chatId: ChatBusEvent["chatId"]): readonly InvalidateFilter[] {
  return [...chatDetailReads(trpc, chatId), trpc.chat.listChats.pathFilter()];
}

const BUS_FILTERS: BusFilterMap = {
  delta: nothing,
  reasoningStreamDone: nothing,
  // Turn ACCEPTED — a slot-open signal only (the reducer opens the pending slot); nothing durable changed, so
  // no refetch, exactly like turnStarted.
  turnAccepted: nothing,
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
  // The roster/group/override/membership catch-all ("refetch the chat detail"). `getGroupConfig` rides
  // here EXPLICITLY: it is the Group tab's OWN read of the `chats.metadata.group` sub-blob and does not
  // live under `getChat`, so without this a second tab/device sitting in the same room kept showing the
  // PREVIOUS room behavior forever (staleTime is Infinity and refetchOnWindowFocus is off — the bus is the
  // only freshness driver). The setter's own `invalidates` only ever covered the writing tab.
  chatUpdated: (e, trpc) => [...chatReads(trpc, e.chatId), trpc.chat.getGroupConfig.queryFilter({ chatId: e.chatId })],
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
  // A preset edit changes the effective params (maxOutput/maxContext) the fit reserves against, so the
  // transcript divider's budget must refetch too (the boundary tracks knob changes live, PD-#7).
  presetsChanged: (_e, trpc) => [trpc.preset.pathFilter(), trpc.chat.previewContextFit.pathFilter()],
  worldInfoChanged: (_e, trpc) => [trpc.worldInfo.pathFilter()],
  tagsChanged: (_e, trpc) => [trpc.tag.pathFilter()],
  // Themes live under the settings router but are a distinct read surface.
  themesChanged: (_e, trpc) => [trpc.settings.listThemes.pathFilter(), trpc.settings.getTheme.pathFilter()],
  // User settings only — not the app/global settings. Routing/roleDefaults changes re-resolve the chat
  // capability (the fit window), so the divider's budget refetches with the settings read — and so does
  // `connection.resolveChatCapability`, the read the preset params panel gates its sampling/reasoning/output
  // axes on (Connections writes roleDefaults through `settings.updateUserSettingsSection`, which is
  // busDriven — without this row, picking a chat model left the editor on its connect-a-model note until a
  // full page reload). Narrow filter, not the connection ROOT: the catalog reads under it are cold-fetch
  // expensive and no roleDefaults edit changes them.
  settingsChanged: (_e, trpc) => [
    trpc.settings.getUserSettings.pathFilter(),
    trpc.chat.previewContextFit.pathFilter(),
    trpc.connection.resolveChatCapability.pathFilter(),
  ],
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

// Third map: the feature-root rpg game bus (`rpg.stream`). LIVE-ONLY like the user bus; the client's tracker/
// journal reads run `staleTime: Infinity`, so an rpg-bus tick is their freshness driver. TOTAL over
// `RpgBusEvent["type"]` (the mapped type below is `bus-definition-belts`' consumer-exhaustiveness belt — a new
// member fails tsc here until it names its reads). SWIPE freshness rides the CHAT bus (`variantSelected`, in
// `BUS_FILTERS`), NOT a new rpg event — nothing is written on swipe-select, so the rpg bus never announces it.
//
// W2 FORWARD-SEAM: the rpg VERB tRPC procs (`trpc.rpg.getTrackerView`/`getGame`/`listJournal`/`getConfigView`)
// land with the W2 rpg router — they do NOT exist on `AppRouter` yet, so each handler returns `[]` for now
// (the map's SHAPE is the belt G11 checks; the real `trpc.rpg.*` filters wire in W2 alongside the stream hook).
// The per-member notes name the read each will invalidate — the same "map ready, procs pending" posture the
// user bus's `connectionsChanged` deferral takes.
type RpgBusFilterMap = {
  readonly [K in RpgBusEvent["type"]]: (event: Extract<RpgBusEvent, { type: K }>, trpc: Trpc) => readonly InvalidateFilter[];
};

const RPG_BUS_FILTERS: RpgBusFilterMap = {
  // The game row itself changed (create/config/knob/mode) — the takeover mode read + the host editor refetch.
  gameChanged: (e, trpc) => [trpc.rpg.getGame.queryFilter({ chatId: e.chatId }), trpc.rpg.getConfigView.queryFilter({ chatId: e.chatId })],
  // A swipe-volatile snapshot was written — the WHOLE panel re-resolves against the new resolved-current
  // snapshot (§4.9), so the single tracker aggregate refetches (every tab reads it).
  snapshotPatched: (e, trpc) => [trpc.rpg.getTrackerView.queryFilter({ chatId: e.chatId })],
  // A per-actor identity sheet changed — the Status/Sheet tabs ride the same tracker aggregate.
  sheetChanged: (e, trpc) => [trpc.rpg.getTrackerView.queryFilter({ chatId: e.chatId })],
  // The snapshot-resident quest plane changed — the Scene tab's goal lines ride the tracker aggregate.
  questChanged: (e, trpc) => [trpc.rpg.getTrackerView.queryFilter({ chatId: e.chatId })],
  // A journal entry landed/changed — the paged, lineage-filtered archive refetches (Journal is full-only,
  // but the listJournal read still invalidates for parity + the future lite→full graduation). Path-level (all
  // pages) — the read is paged, so a page-keyed queryFilter would miss the other pages.
  journalChanged: (_e, trpc) => [trpc.rpg.listJournal.pathFilter()],
};

/** Every rpg filter, for the (re)connect gap-heal (the `use-rpg-bus.ts` blanket invalidate) — the game +
 *  tracker + config + journal reads for one open game, derived so a new read can't drift the heal set. */
function allRpgGameFilters(trpc: Trpc, chatId: ChatId): readonly InvalidateFilter[] {
  return [
    trpc.rpg.getGame.queryFilter({ chatId }),
    trpc.rpg.getTrackerView.queryFilter({ chatId }),
    trpc.rpg.getConfigView.queryFilter({ chatId }),
    trpc.rpg.listJournal.pathFilter(),
  ];
}

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
    invalidateRpg: (event): void => {
      const handler = RPG_BUS_FILTERS[event.type] as (e: RpgBusEvent, t: Trpc) => readonly InvalidateFilter[];
      const filters = handler(event, deps.trpc);
      if (IS_DEV) {
        busInvalidate(event.type, event.chatId, filters.map(filterKeyName));
      }
      invalidateFilters(filters);
    },
    invalidateAllUserRoots: (): void => {
      invalidateFilters(allUserRootFilters(deps.trpc));
    },
    gapHealRpg: (chatId): void => {
      invalidateFilters(allRpgGameFilters(deps.trpc, chatId));
    },
    invalidateFilters,
  };
}
