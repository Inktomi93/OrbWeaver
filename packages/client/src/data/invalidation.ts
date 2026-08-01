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
  /** Gap-heal — on user-bus RE-connect, blanket-invalidate every filter the user map covers. Never on the
   *  first connect of a page load: that mount's own reads ARE the fresh state (`use-user-bus.ts`). */
  readonly invalidateAllUserRoots: () => void;
  /** The mutation half — `createEntityMutation.onSettled` routes its filters through here. */
  readonly invalidateFilters: (filters: readonly InvalidateFilter[]) => void;
}

type BusFilterMap = {
  readonly [K in ChatBusEvent["type"]]: (event: Extract<ChatBusEvent, { type: K }>, trpc: Trpc) => readonly InvalidateFilter[];
};

const nothing = (): readonly InvalidateFilter[] => [];

// The open chat's CANON reads (no chat list, no `getChat`) — message list, the swipe strip's step-target
// resolver, and the transcript divider's present-tense fit budget (previewContextFit — the boundary moves
// when canon commits/trims, so it refetches on every canon-terminal alongside the list).
//
// `getChat` is DELIBERATELY ABSENT: `ChatDetail` projects the `chats` ROW + roster only (title/star/archived/
// anchor/pendingHost/metadata group·overrides·background·rpg·opening/compact checkpoint/participants — see
// `substrate/chat-detail.ts`), and NOTHING in it derives from canon. Every transition that DOES stale it fires
// its own event, each naming `getChat` explicitly below: `chatUpdated` (title/star/archive/variables/
// injections/roster/handoff AND the auto-compaction checkpoint — the engine emits it on every marker write),
// `personaSwitched`, `chatOpened`, `historyTruncated`, the five `wi*` arms, `chatDeleted`. Carrying it here
// re-fetched the room on every commit/edit/terminal — the measured startChat burst was FOUR `getChat` wire
// fetches in 80ms (two of them from the greeting + user-row `messageCommitted` pair), and a plain turn paid
// two more on commit+complete. `invalidateQueries` does NOT dedupe against an in-flight fetch (it cancels and
// restarts), so every redundant row here is a real round-trip.
//
function chatCanonReads(trpc: Trpc): readonly InvalidateFilter[] {
  return [
    trpc.chat.listMessages.pathFilter(),
    trpc.chat.listMessageVariants.pathFilter(),
    trpc.chat.previewContextFit.pathFilter(),
    ...promptPreviewReads(trpc),
  ];
}

// `rpg.revealHidden` is an RPG read with a CANON driver: the verb DERIVES it from the stored selected-variant
// assistant BODIES (`domain/rpg/verbs/read/reveal-hidden.ts` — no table of its own), so its freshness driver
// is a BODY WRITE, not the rpg bus. Without a row the host's veiled cue + Veiled ledger froze at the count
// they had when the panel first mounted (the previewAssembly class — every new GM lie invisible until GC or
// a reload).
//
// It rides the BODY-WRITE terminals ONLY, never `turnCompleted`: a generated turn emits `messageCommitted`
// (the commit that writes the body) and then `turnCompleted` on the very next line of the engine — the second
// event changes no body, so carrying the reveal on both bought a duplicate wire fetch on EVERY turn (and
// `invalidateQueries` does not dedupe against an in-flight fetch — it cancels and restarts it). Every path
// that writes/changes an assistant body does emit `messageCommitted` (engine commit, edit, narrator post,
// generated image, the opening greeting), and the swipe/edit/delete family carries it through `chatReads`,
// so nothing the host can see goes stale. Costs nothing on a non-RPG chat or for a member: `invalidateQueries`
// is a no-op for a key with no cache entry, and the read only mounts for the host of a game.
function hiddenRevealRead(trpc: Trpc): readonly InvalidateFilter[] {
  return [trpc.rpg.revealHidden.pathFilter()];
}

// The NEXT TURN'S PROMPT, as the Preview tab shows it: the assembled-prompt trace + the content-free shape
// trace (`features/chat/components/assembly-preview-panel.tsx`). Both were in ZERO map rows, and the
// QueryClient runs `staleTime: Infinity` — so the tab froze at its first fetch FOREVER (the reported "old
// persona still in the preview": the server re-pin was correct, the panel was showing a snapshot from before
// it). They ride the SAME row as `previewContextFit` everywhere — the fit is the budget of exactly this
// assembly, so a row that refetches one and not the other makes the two halves of that tab disagree.
function promptPreviewReads(trpc: Trpc): readonly InvalidateFilter[] {
  return [trpc.chat.previewAssembly.pathFilter(), trpc.chat.getShapeTrace.pathFilter()];
}

// Canon reads plus the chat list, for non-terminal canon events the server fires no chatsChanged for. Every
// event on this set moves (or can move) a stored body — an edit, a swipe, a hide, a delete/reorder — so the
// host-reveal derivation rides with it.
function chatReads(trpc: Trpc): readonly InvalidateFilter[] {
  return [...chatCanonReads(trpc), ...hiddenRevealRead(trpc), trpc.chat.listChats.pathFilter()];
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

  // Canon-terminal commit — the open chat's canon only; the chat list/character-library recency is
  // driven by the user-bus chatsChanged fan on this same moment (avoids a triple-invalidate).
  messageCommitted: (_e, trpc) => [...chatCanonReads(trpc), ...hiddenRevealRead(trpc)],
  messageEdited: (_e, trpc) => chatReads(trpc),
  messageHidden: (_e, trpc) => chatReads(trpc),
  variantSelected: (_e, trpc) => chatReads(trpc),
  messagesDeleted: (_e, trpc) => chatReads(trpc),
  messagesReordered: (_e, trpc) => chatReads(trpc),
  reasoningEdited: (_e, trpc) => chatReads(trpc),
  reasoningCleared: (_e, trpc) => chatReads(trpc),

  turnCompleted: (_e, trpc) => chatCanonReads(trpc),
  turnAborted: (_e, trpc) => chatReads(trpc),

  // A re-anchored persona rewrites `{{user}}` (and the persona block) in the NEXT turn's prompt — the room
  // read AND the prompt preview.
  personaSwitched: (e, trpc) => [trpc.chat.getChat.queryFilter({ chatId: e.chatId }), ...promptPreviewReads(trpc)],

  // Attachment changes move the ASSEMBLY POOL — the WI reads, the room, and the prompt preview built from it.
  wiBookAttached: (e, trpc) => [trpc.worldInfo.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId }), ...promptPreviewReads(trpc)],
  wiBookDetached: (e, trpc) => [trpc.worldInfo.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId }), ...promptPreviewReads(trpc)],
  wiEntryAttached: (e, trpc) => [trpc.worldInfo.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId }), ...promptPreviewReads(trpc)],
  wiEntryDetached: (e, trpc) => [trpc.worldInfo.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId }), ...promptPreviewReads(trpc)],
  wiEntryScopeChanged: (e, trpc) => [trpc.worldInfo.pathFilter(), trpc.chat.getChat.queryFilter({ chatId: e.chatId }), ...promptPreviewReads(trpc)],

  // NOTHING — the chat list is driven by the user-bus `chatsChanged` fan the SAME commit emits (both
  // producers, `verbs/start-chat.ts` + `verbs/fork.ts`, call `emitChatChanged` on the line after
  // `emit({type:"chatCreated"})`). That fan reaches every present member on every device; this chat-bus arm
  // only ever reaches the creator (through the draft→committed from-zero replay seed in `use-chat-bus.ts`),
  // so its `listChats` row was a pure second wire fetch of the list the fan had already refetched.
  chatCreated: nothing,
  chatDeleted: (e, trpc) => [...chatReads(trpc), trpc.chat.getChat.queryFilter({ chatId: e.chatId })],
  chatOpened: (e, trpc) => [trpc.chat.getChat.queryFilter({ chatId: e.chatId })],
  historyTruncated: (e, trpc) => [trpc.chat.getChat.queryFilter({ chatId: e.chatId })],
  // The roster/group/override/membership catch-all ("refetch the chat detail"). `getGroupConfig` rides
  // here EXPLICITLY: it is the Group tab's OWN read of the `chats.metadata.group` sub-blob and does not
  // live under `getChat`, so without this a second tab/device sitting in the same room kept showing the
  // PREVIOUS room behavior forever (staleTime is Infinity and refetchOnWindowFocus is off — the bus is the
  // only freshness driver). The setter's own `invalidates` only ever covered the writing tab.
  // `listChatInjections` rides here for the SAME reason as `getGroupConfig`: the injections manager reads the
  // `chat_injections` rows through their OWN proc (not under `getChat`), and every injection write emits this
  // catch-all (`verbs/chat-lifecycle.ts` set/delete). Without the row, only the writing tab reconciled — a
  // member (or the host's second tab) sat on the pre-edit splice list forever.
  chatUpdated: (e, trpc) => [
    ...chatReads(trpc),
    trpc.chat.getChat.queryFilter({ chatId: e.chatId }),
    trpc.chat.getGroupConfig.queryFilter({ chatId: e.chatId }),
    trpc.chat.listChatInjections.queryFilter({ chatId: e.chatId }),
    // `getUserMacroPicks` rides here for the SAME reason as `getGroupConfig`/`listChatInjections`: the MU
    // picks pane reads the room's `chats.user_macro_values` through its OWN proc (not under `getChat`), and
    // `setUserMacroValues` emits this catch-all. Without the row only the writing tab reconciled — a second
    // member sat on the pre-pick bag forever (staleTime is Infinity; the bus is the only driver).
    trpc.chat.getUserMacroPicks.queryFilter({ chatId: e.chatId }),
  ],
};

// Second map: the per-user bus. staleTime: Infinity means only a bus tick refetches a non-chat
// domain read; this is the freshness driver for every surface the chat bus doesn't reach. Coarse by
// design — each member path-invalidates its whole domain root.
type UserBusFilterMap = {
  readonly [K in UserBusEvent["type"]]: (event: Extract<UserBusEvent, { type: K }>, trpc: Trpc) => readonly InvalidateFilter[];
};

const USER_BUS_FILTERS: UserBusFilterMap = {
  // `chat.getMemberCard` is a CHAT-scoped projection of a character card (host-owned, clamped by the room's
  // memberCardVisibility) — a card edit is announced HERE, not on the chat bus, so without this row the member-
  // card dialog re-opened inside its gcTime window showed the pre-edit card. Path-level and free when the
  // dialog is closed (the read is `enabled: open`, so there is no cache entry to refetch).
  charactersChanged: (_e, trpc) => [trpc.character.pathFilter(), trpc.chat.getMemberCard.pathFilter()],
  personasChanged: (_e, trpc) => [trpc.persona.pathFilter()],
  // A preset edit changes the effective params (maxOutput/maxContext) the fit reserves against, so the
  // transcript divider's budget must refetch too (the boundary tracks knob changes live, PD-#7) — and the
  // preset OWNS the prompt's section order/content, so the prompt preview is stale on the same edit.
  // `getUserMacroPicks` rides a preset edit too: its DECLARATIONS half IS the active preset's `userMacros`
  // (adding/removing a macro input changes which controls the picks pane must render), and no chat-bus event
  // fires when the preset — a different domain's row — is edited.
  presetsChanged: (_e, trpc) => [
    trpc.preset.pathFilter(),
    trpc.chat.previewContextFit.pathFilter(),
    trpc.chat.getUserMacroPicks.pathFilter(),
    ...promptPreviewReads(trpc),
  ],
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
    // The same settings feed the ASSEMBLY the fit measures (chat behavior, the resolved model/capability the
    // shaper builds against) — the preview must move with the budget, never lag a knob behind it.
    ...promptPreviewReads(trpc),
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
  // `revealHidden` rides along: the M4 knob (`config.features.hiddenContentReveal`) makes the verb return the
  // EMPTY reveal, so flipping it must empty/refill the host's veiled surfaces immediately.
  gameChanged: (e, trpc) => [
    trpc.rpg.getGame.queryFilter({ chatId: e.chatId }),
    trpc.rpg.getConfigView.queryFilter({ chatId: e.chatId }),
    trpc.rpg.revealHidden.queryFilter({ chatId: e.chatId }),
  ],
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
 *  tracker + config + journal + host-reveal reads for one open game, derived so a new read can't drift the
 *  heal set. */
function allRpgGameFilters(trpc: Trpc, chatId: ChatId): readonly InvalidateFilter[] {
  return [
    trpc.rpg.getGame.queryFilter({ chatId }),
    trpc.rpg.getTrackerView.queryFilter({ chatId }),
    trpc.rpg.getConfigView.queryFilter({ chatId }),
    trpc.rpg.listJournal.pathFilter(),
    trpc.rpg.revealHidden.queryFilter({ chatId }),
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
