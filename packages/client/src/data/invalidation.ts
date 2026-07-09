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
// ALSO invalidate the keys that event covers: it declares `busDriven: true` (createEntityMutation) —
// which makes `invalidates` a compile error, not just an empty function. Doing both double-refetched the
// SAME keys (a send fired getChat/listMessages/listChats 4-5× — the observed storm). Verified by the
// exhaustive contract test (tests/client/data/invalidation.test.ts). A mutation KEEPS an `invalidates`
// entry ONLY for a key NO delivered bus event covers — i.e.:
//   • it acts on a DIFFERENT chat than the one subscribed (chat-row rename/star/archive/delete, and
//     startChat/forkChat which create a chat you're not yet subscribed to → keep `listChats`); or
//   • it invalidates a read no `chatReads`/`chatUpdated` covers (e.g. `listChatInjections`).
// The reducer (`apply-chat-bus-event.ts`) + this map are BOTH exhaustive, so "which event a verb emits"
// is the only per-mutation fact to check; the audit table lives in the mutation files' own headers.
//
// ── THE SECOND (USER) BUS extends the SAME rule (PD user-bus lane) ─────────────────────────────────
// `use-user-bus.ts` mounts an ALWAYS-ON per-user stream at `home-page.tsx`. Every NON-chat owned surface
// (characters/personas/presets/world-info/user-settings/themes/tags/credentials + the chat LIST) is now
// bus-covered: its mutating server verb emits a `UserBusEvent`, and `USER_BUS_FILTERS` (below) runs its
// filters. So the mutation-vs-bus rule is IDENTICAL — a mutation whose verb emits a COVERING `UserBusEvent`
// declares `busDriven` instead of `invalidates` (the echo reconciles the acting device too, so a
// self-invalidate would double-refetch). A mutation KEEPS `invalidates` ONLY for a key the emitted event
// does NOT cover (e.g. `removeTheme` emits `themesChanged` — covers listThemes/getTheme — but must ALSO
// refetch `getUserSettings` for the orphaned `selectedThemeId`, which no user event covers → it keeps that
// one key). The flips landed for the chat-row + persona + theme + appearance mutations (their file headers
// carry the per-verb audit tables); other domains' mutation hooks are covered by the emits too and are
// flip-eligible follow-ups.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import { USER_BUS_EVENT_TYPES } from "@orb/contracts/user-bus";
import type { InvalidateQueryFilters, QueryClient } from "@tanstack/react-query";
import { busDupCheck, busInvalidate, IS_DEV } from "#lib";
import type { Trpc } from "./trpc";

/** What the proxy's `.queryFilter()`/`.pathFilter()` return — accepted by `invalidateQueries`. */
export type InvalidateFilter = InvalidateQueryFilters;

/** The tRPC filter's dotted path (`queryKey [["chat","getChat"], …] → "chat.getChat"`) — the readable
 *  key name the `[bus]` dev log + its dup alarm key off. Dev-only; shape-tolerant (never throws). */
function filterKeyName(filter: InvalidateFilter): string {
  const queryKey = (filter as { readonly queryKey?: readonly unknown[] }).queryKey;
  const path = Array.isArray(queryKey) ? queryKey[0] : undefined;
  return Array.isArray(path) ? path.join(".") : "?";
}

export interface Invalidation {
  /** The bus half — routes a `ChatBusEvent` through the exhaustive map. Fire-and-forget. */
  readonly invalidate: (event: ChatBusEvent) => void;
  /** The USER-bus half (PD user-bus lane) — routes a `UserBusEvent` through the second exhaustive map
   *  (`USER_BUS_FILTERS`). Fire-and-forget. Driven by `use-user-bus.ts`'s `onData`. */
  readonly invalidateUser: (event: UserBusEvent) => void;
  /** The GAP-HEAL — on every user-bus (re)connect, blanket-invalidate every filter the user map covers
   *  (a missed live tick while disconnected costs one refetch; invalidation is idempotent). Driven by
   *  `use-user-bus.ts`'s onConnect/onReconnect. */
  readonly invalidateAllUserRoots: () => void;
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

// The OPEN chat's DETAIL reads (NO chat list): the room read + the message list + the swipe strip's step-target
// resolver. Cheap + precise: getChat + listMessages are input/THIS-chat scoped; listMessageVariants is
// path-scoped (a swipe/select/delete may touch any slot's sibling set — the read is cheap/gated). The
// canon-TERMINAL events (`messageCommitted`/`turnCompleted`) use THIS set — NOT `chatReads` — because the chat
// LIST (`listChats`) + character library (`character.list`) recency is now driven by the user-bus `chatsChanged`
// fan the server fires on the SAME terminal moments (see the SECOND map below): the fan's echo reaches the
// acting device too, so ALSO carrying `listChats`/`character.list` here would triple-invalidate them inside the
// commit+complete window (`bus-devlog.ts` DUP_ALARM_MIN) — one driver per surface: chat-bus → the open chat's
// detail, user-bus `chatsChanged` → the chat list + character library (same AND cross device).
function chatDetailReads(trpc: Trpc, chatId: ChatBusEvent["chatId"]): readonly InvalidateFilter[] {
  return [
    trpc.chat.getChat.queryFilter({ chatId }),
    trpc.chat.listMessages.pathFilter(),
    trpc.chat.listMessageVariants.pathFilter(),
  ];
}

// The DETAIL reads PLUS the chat list (recency/preview move on any canon change). The NON-terminal canon events
// (edit/hide/reorder/delete/select) use this: they change the open chat's list preview but the server fires no
// `chatsChanged` for them (cross-device list recency on those is the reconnect story — deferred), so `listChats`
// stays here as their same-device list driver. `listChats` is path-scoped.
function chatReads(trpc: Trpc, chatId: ChatBusEvent["chatId"]): readonly InvalidateFilter[] {
  return [...chatDetailReads(trpc, chatId), trpc.chat.listChats.pathFilter()];
}

const BUS_FILTERS: BusFilterMap = {
  // Stream-transient — the chat-stream store owns these; no read model changes until terminal.
  delta: nothing,
  reasoningStreamDone: nothing,
  turnStarted: nothing,
  warning: nothing,
  worldInfoActivated: nothing, // per-turn trace (automation trigger) — no query reads it

  // The canon-TERMINAL commit — the OPEN chat's detail ONLY. The chat LIST + character-library recency
  // (`listChats` + `character.list`) is driven by the server's `chatsChanged` member-fan on this SAME moment
  // (the SECOND map's `chatsChanged` arm) — one driver per surface, no triple-invalidate (see `chatDetailReads`).
  messageCommitted: (e, trpc) => chatDetailReads(trpc, e.chatId),
  messageEdited: (e, trpc) => chatReads(trpc, e.chatId),
  messageHidden: (e, trpc) => chatReads(trpc, e.chatId),
  variantSelected: (e, trpc) => chatReads(trpc, e.chatId),
  messagesDeleted: (e, trpc) => chatReads(trpc, e.chatId),
  messagesReordered: (e, trpc) => chatReads(trpc, e.chatId),
  reasoningEdited: (e, trpc) => chatReads(trpc, e.chatId),
  reasoningCleared: (e, trpc) => chatReads(trpc, e.chatId),

  // Turn terminal — completion commits canon; the OPEN chat's detail ONLY (the chat LIST + character-library
  // recency ride the server's `chatsChanged` member-fan on this same moment — see `messageCommitted`). An abort
  // may still have committed a partial → the full `chatReads` (no server `chatsChanged` fires on an abort, so
  // `listChats` stays here as its same-device driver; the next commit's fan heals cross-device recency).
  turnCompleted: (e, trpc) => chatDetailReads(trpc, e.chatId),
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
  // Ephemeral sprite-swap presentation state (expressions-design/02 §4) — invalidates NOTHING (there is
  // no query to refetch; the stage holder reads it directly off the bus). Explicit `[]`, never omitted.
  expression: () => [],
  chatUpdated: (e, trpc) => chatReads(trpc, e.chatId),
};

// ── THE SECOND MAP: the per-USER bus (PD user-bus lane) ────────────────────────────────────────────
// `staleTime: Infinity` means the ONLY thing that refetches a NON-chat domain read is a bus tick. The
// chat bus (above) reaches only the OPEN chat's subscribers; this map is the freshness driver for every
// OTHER owned surface (characters/personas/presets/world-info/user-settings/themes/tags/credentials + the
// chat LIST). Same discipline: a mapped-type `Record` over `UserBusEvent["type"]` — a NEW member fails
// `tsc` here until this table says what it invalidates ("nothing" is an explicit `[]`, never an omission).
// COARSE by design: each member path-invalidates its whole domain root (the optional entity id on the event
// is a hint we deliberately don't narrow on in v1 — a path invalidate is cheap + can't miss a dependent
// read). Because this subscription is ALWAYS on (mounted once at `home-page.tsx`), any mutation whose verb
// emits a covering `UserBusEvent` declares `busDriven` (createEntityMutation) instead of `invalidates` —
// the SAME mutation-vs-bus rule the chat-bus doctrine states above (the per-file header audit tables record
// the flips).
type UserBusFilterMap = {
  readonly [K in UserBusEvent["type"]]: (
    event: Extract<UserBusEvent, { type: K }>,
    trpc: Trpc,
  ) => readonly InvalidateFilter[];
};

const USER_BUS_FILTERS: UserBusFilterMap = {
  charactersChanged: (_e, trpc) => [trpc.character.pathFilter()],
  personasChanged: (_e, trpc) => [trpc.persona.pathFilter()],
  presetsChanged: (_e, trpc) => [trpc.preset.pathFilter()],
  worldInfoChanged: (_e, trpc) => [trpc.worldInfo.pathFilter()],
  tagsChanged: (_e, trpc) => [trpc.tag.pathFilter()],
  // Themes live UNDER the settings router but are a distinct read surface — invalidate only the theme reads,
  // not the whole settings root (user-settings has its own member below).
  themesChanged: (_e, trpc) => [
    trpc.settings.listThemes.pathFilter(),
    trpc.settings.getTheme.pathFilter(),
  ],
  // User settings only — NOT the app/global settings (those are admin/global, no per-user bus emit).
  settingsChanged: (_e, trpc) => [trpc.settings.getUserSettings.pathFilter()],
  credentialsChanged: (_e, trpc) => [trpc.credentials.pathFilter()],
  // THE chat-list + character-library recency driver (same AND cross device), and the SOLE driver on the
  // message-commit terminal path. The server fans `chatsChanged` to EVERY present human member's channel on
  // BOTH (a) the canon-commit terminal moments (`messageCommitted`/`turnCompleted` — chat-list ordering +
  // `character.list` `lastChattedAt` recency; the chat-bus map arms dropped `listChats`/`character.list` to
  // avoid a triple-invalidate) AND (b) the chat LIST-level lifecycle ops (start/fork/rename/star/archive/
  // delete/kick). Always refetches `listChats` + `character.list`; `chatId` present (lifecycle) ALSO refetches
  // that chat's `getChat` (the row/detail changed) — the terminal-path fan OMITS `chatId` (the per-chat bus
  // already drives the open chat's `getChat` on every subscribed device, so carrying it here would triple it).
  //   • Multi-human: a non-host member's fan refetches a `character.list` whose rows didn't change (the host
  //     owns the characters) — accepted (one cheap path-invalidate; the map is static per-event, not per-role).
  //   • A `chatsChanged` for a chat you ALSO have open double-invalidates its `getChat`/`listChats` with the
  //     per-chat bus — a harmless extra refetch (the [bus] dup-alarm tolerates 2×, fires at 3×), never stale.
  chatsChanged: (e, trpc) =>
    e.chatId === undefined
      ? [trpc.chat.listChats.pathFilter(), trpc.character.list.pathFilter()]
      : [
          trpc.chat.listChats.pathFilter(),
          trpc.chat.getChat.queryFilter({ chatId: e.chatId }),
          trpc.character.list.pathFilter(),
        ],
  // DEFERRED member (never emitted today — see @orb/contracts/user-bus + the gate's DEFERRED allowlist). The
  // map entry is READY: when a per-user connection store lands and emits this, it invalidates the connection
  // reads with no further client change. Harmless until then (nothing dispatches it).
  connectionsChanged: (_e, trpc) => [trpc.connection.pathFilter()],
};

/** Every filter the user map covers — the gap-heal set (`invalidateAllUserRoots`). Derived from the map so
 *  it CANNOT drift: a new member's filters are automatically part of the blanket. The coarse handlers ignore
 *  the event id, so a minimal `{ type }` event exercises the exact path each produces. */
function allUserRootFilters(trpc: Trpc): readonly InvalidateFilter[] {
  return (Object.keys(USER_BUS_EVENT_TYPES) as UserBusEvent["type"][]).flatMap((type) => {
    const handler = USER_BUS_FILTERS[type] as (
      e: UserBusEvent,
      t: Trpc,
    ) => readonly InvalidateFilter[];
    return handler({ type } as UserBusEvent, trpc);
  });
}

export function createInvalidation(deps: {
  readonly queryClient: QueryClient;
  readonly trpc: Trpc;
}): Invalidation {
  const invalidateFilters = (filters: readonly InvalidateFilter[]): void => {
    for (const filter of filters) {
      // [bus] dev alarm: same key twice inside the window is the storm signature. Catches BOTH a
      // doubled bus delivery AND a mutation re-invalidating a key the bus already covers (both paths
      // route here). IS_DEV-guarded so the name extraction folds out of prod.
      if (IS_DEV) {
        busDupCheck(filterKeyName(filter));
      }
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
      const filters = handler(event, deps.trpc);
      // [bus] dev log: this canon event → the exact keys it refetched (the attribution the [trpc]
      // channel can't give — it never sees the stream). Folds out of prod with IS_DEV.
      if (IS_DEV) {
        busInvalidate(event.type, event.chatId, filters.map(filterKeyName));
      }
      invalidateFilters(filters);
    },
    invalidateUser: (event): void => {
      // Same total-indexed dispatch as the chat half; the cast narrows the handler's event param back from
      // the union member the index erased.
      const handler = USER_BUS_FILTERS[event.type] as (
        e: UserBusEvent,
        t: Trpc,
      ) => readonly InvalidateFilter[];
      const filters = handler(event, deps.trpc);
      if (IS_DEV) {
        // No chatId on a user event — the second arg is a free-form label; use the discriminator.
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
