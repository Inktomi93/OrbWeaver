// The central invalidation seam (data/invalidation.ts header): ONE exhaustive event→filters map +
// ONE `invalidateFilters` chokepoint — the neo lesson was invalidation sprawl (81 call sites, no
// map), not queryKey drift. This pins the map's actual DISPATCH behavior against a REAL `QueryClient`
// + a REAL tRPC options proxy (never a hand-mock — a mock erases exactly the queryKey/queryFilter
// shape this seam exists to get right): a canon-mutation event invalidates the room + message-list +
// chat-list reads; a stream-transient event ("nothing" map entries) invalidates NONE of them; the
// mutation-facing `invalidateFilters` chokepoint (what `createEntityMutation.onSettled` calls) marks
// its target stale too. `QueryClient.invalidateQueries` MARKS a matched query `isInvalidated` even
// with no active observer (only the optional refetch needs one) — so this needs no mounted query,
// no network: `createTrpcClient()` never fires a request until something actually queries.

import { createInvalidation, createTrpcClient, createTrpcProxy } from "@orb/client/data";
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { RpgBusEvent } from "@orb/contracts/rpg";
import { RPG_BUS_EVENT_TYPES } from "@orb/contracts/rpg";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { CharacterId, ChatId, MessageId, PresetId, RpgSheetId, RpgSnapshotId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { QueryClient } from "@tanstack/react-query";
import { describe, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

const CHAT_ID = castId<ChatId>("chat_invalidationtest");
const MESSAGE_ID = castId<MessageId>("msg_invalidationtest0");
const CHARACTER_ID = castId<CharacterId>("char_invalidationtest");
const PRESET_ID = castId<PresetId>("preset_invalidationtest");

/** Fresh client + proxy per test — no shared cache state to bleed across assertions. */
function setup(): ReturnType<typeof createInvalidation> & {
  readonly queryClient: QueryClient;
  readonly trpc: ReturnType<typeof createTrpcProxy>;
} {
  const queryClient = new QueryClient();
  const trpc = createTrpcProxy(createTrpcClient("http://localhost/api/trpc"), queryClient);
  return { ...createInvalidation({ queryClient, trpc }), queryClient, trpc };
}

function isInvalidated(queryClient: QueryClient, queryKey: readonly unknown[]): boolean {
  return queryClient.getQueryCache().find({ queryKey: [...queryKey] })?.state.isInvalidated ?? false;
}

// ── The exhaustive event→filter contract ─────────────────────────────────────────────────────────
// The five reads any `BUS_FILTERS` entry can touch. A new invalidation TARGET beyond these needs a new
// tracked key here (the seed + assert loop then covers it). Declared as a tuple (the axis lives once),
// with the union derived — `no-inline-union-redecl`.
const TRACKED_KEYS = [
  "getChat",
  "listMessages",
  "listMessageVariants",
  // The transcript divider's present-tense fit budget (previewContextFit) — refetched on every canon terminal
  // (the boundary moves when canon commits/trims) alongside the message list.
  "previewContextFit",
  "listChats",
  "worldInfo",
  // The character library `character.list` — driven ONLY by the user-bus `chatsChanged` fan now (the sole
  // `lastChattedAt` recency driver, same AND cross device); the chat-bus terminal arms no longer carry it.
  "characterList",
  // The Group tab's OWN read of `chats.metadata.group` — it does NOT live under `getChat`, so it needs its
  // own filter on the roster/group catch-all or a second tab/device in the same room shows stale room
  // behavior forever (staleTime Infinity + refetchOnWindowFocus off ⇒ the bus is the only freshness driver).
  "getGroupConfig",
  // The Preview tab's two reads (`chat.previewAssembly` + `chat.getShapeTrace`) — the NEXT turn's prompt.
  // They were in NO map row, so with `staleTime: Infinity` the tab froze at its first fetch forever (the
  // reported "old persona still in the preview" after a correct server re-pin). They ride the same rows as
  // `previewContextFit` — the fit is the budget of exactly this assembly.
  "previewAssembly",
  "getShapeTrace",
  // The host's veiled cue + Veiled ledger (`rpg.revealHidden`). It is an RPG read with a CANON driver: the
  // verb derives it from the stored assistant BODIES, so a new GM lie lands with the BODY WRITE
  // (`messageCommitted` + the edit/swipe/delete family), not with an rpg-bus tick and not with the
  // `turnCompleted` that trails the same commit. It was in zero rows (the previewAssembly class — the count
  // froze at panel mount).
  "revealHidden",
  // The injections manager's own read of `chat_injections` (`chat.listChatInjections`). Every injection write
  // emits the `chatUpdated` catch-all (verbs/chat-lifecycle.ts), but only the writing tab reconciled — the
  // `getGroupConfig` case, one proc over.
  "listChatInjections",
] as const;
type TrackedKey = (typeof TRACKED_KEYS)[number];

// The OPEN chat's CANON reads (`chatCanonReads` in invalidation.ts) — NO chat list, and NO `getChat`: nothing
// in `ChatDetail` derives from canon (it is the `chats` ROW + roster), so the events below that only move canon
// must NOT refetch the room — every row-staling transition fires its own event naming `getChat` explicitly
// (chatUpdated/personaSwitched/chatOpened/historyTruncated/wi*/chatDeleted). The canon-TERMINAL events
// (messageCommitted/turnCompleted) use this: the chat LIST + character library recency rides the server's
// `chatsChanged` member-fan on the same moment (one driver per surface, no triple-invalidate).
const CHAT_CANON_READS: readonly TrackedKey[] = ["listMessages", "listMessageVariants", "previewContextFit", "previewAssembly", "getShapeTrace"];

// The host-reveal derivation (`rpg.revealHidden`) rides the BODY-WRITE terminals only — `messageCommitted`
// and the non-terminal canon mutations — never `turnCompleted`. A generated turn emits `messageCommitted`
// (the body write) and `turnCompleted` immediately after with no further body change, so carrying it on both
// was a duplicate wire fetch on every turn (and an invalidate CANCELS an in-flight fetch and restarts it).
const CANON_BODY_WRITE_READS: readonly TrackedKey[] = [...CHAT_CANON_READS, "revealHidden"];

// The full canon+list refetch (`chatReads` = canon + `listChats`) — the NON-terminal canon events that fire no
// server `chatsChanged` (edit/hide/reorder/delete/select/abort) keep `listChats` as their same-device driver.
const CHAT_READS: readonly TrackedKey[] = [...CANON_BODY_WRITE_READS, "listChats"];

// The freshness contract in ONE readable table, EXHAUSTIVE over `ChatBusEvent["type"]`: a new bus member
// fails `tsc` HERE (the `Record<…>` is total) until it declares what it invalidates — mirroring the
// `BUS_FILTERS` mapped type it verifies. Change a `BUS_FILTERS` entry and the exhaustive test below drifts red.
const EXPECTED: Record<ChatBusEvent["type"], readonly TrackedKey[]> = {
  // Stream-transient — no read model changes until a terminal/canon event.
  delta: [],
  reasoningStreamDone: [],
  turnAccepted: [], // slot-open signal only (opens the pending slot); nothing durable changed
  turnStarted: [],
  warning: [],
  worldInfoActivated: [], // per-turn trace; no query reads it
  // The canon-TERMINAL commits (messageCommitted/turnCompleted) refetch the OPEN chat's CANON only — the chat
  // LIST (`listChats`) + character library (`characterList`) recency rides the server's `chatsChanged`
  // member-fan on the same moment (one driver per surface, no triple-invalidate). Non-terminal canon mutations
  // (edit/hide/select/delete/reorder/abort) fire no server `chatsChanged`, so they keep the full `chatReads`.
  messageCommitted: CANON_BODY_WRITE_READS,
  messageEdited: CHAT_READS,
  messageHidden: CHAT_READS,
  variantSelected: CHAT_READS,
  messagesDeleted: CHAT_READS,
  messagesReordered: CHAT_READS,
  reasoningEdited: CHAT_READS,
  reasoningCleared: CHAT_READS,
  turnCompleted: CHAT_CANON_READS,
  turnAborted: CHAT_READS,
  // The room is GONE — the canon+list refetch plus the room read itself (the open room's `getChat` must
  // re-resolve, not sit on a detail for a chat that no longer exists).
  chatDeleted: [...CHAT_READS, "getChat"],
  // The roster/group/override/membership/compaction-checkpoint catch-all — the full canon+list refetch PLUS the
  // room read (this arm is one of the chat-row transitions that DOES stale `ChatDetail`) PLUS the Group tab's own
  // `getGroupConfig` read (the only bus arm that carries it; proven cross-tab by
  // tests/e2e/multi-tab-room-sync.spec.ts).
  chatUpdated: [...CHAT_READS, "getChat", "getGroupConfig", "listChatInjections"],
  // Room + the prompt preview: a re-anchored persona rewrites `{{user}}` in the next turn's prompt.
  personaSwitched: ["getChat", "previewAssembly", "getShapeTrace"],
  // Room-only (an attach/resume signal — the prompt didn't change, the transport did).
  chatOpened: ["getChat"],
  historyTruncated: ["getChat"],
  // World-info attachment — the WI reads + the room + the prompt preview (assembly POOL changed).
  wiBookAttached: ["worldInfo", "getChat", "previewAssembly", "getShapeTrace"],
  wiBookDetached: ["worldInfo", "getChat", "previewAssembly", "getShapeTrace"],
  wiEntryAttached: ["worldInfo", "getChat", "previewAssembly", "getShapeTrace"],
  wiEntryDetached: ["worldInfo", "getChat", "previewAssembly", "getShapeTrace"],
  wiEntryScopeChanged: ["worldInfo", "getChat", "previewAssembly", "getShapeTrace"],
  // Chat-row lifecycle — NOTHING: the user-bus `chatsChanged` the same server commit fans (start-chat/fork emit
  // both back-to-back) is the ONE chat-list driver, and it reaches every member on every device; this arm only
  // ever reaches the creator via the draft→committed replay seed, so a `listChats` row here was a second wire
  // fetch of the list that fan had already refetched (the measured startChat burst: listChats 3× in 79ms).
  chatCreated: [],
};

// A minimal event of a given `type`. Every `BUS_FILTERS` handler reads ONLY the discriminant `type` (the
// dispatch) + `event.chatId` (verified: each entry is `nothing`, `chatReads(_, e.chatId)`, or reads
// `e.chatId` / ignores `_e`), so a two-field event exercises the EXACT filter path. Event-shape VALIDITY is
// the contract `.test-d` / reducer test's job — coupling this filter test to 26 payload shapes would add
// churn with no coverage, hence the deliberate `as unknown as`.
function eventOf(type: ChatBusEvent["type"]): ChatBusEvent {
  return { type, chatId: CHAT_ID } as unknown as ChatBusEvent;
}

describe("invalidation — the bus half (invalidate)", () => {
  test("the event→filter contract holds for EVERY ChatBusEvent type", () => {
    const actual: Record<string, readonly TrackedKey[]> = {};

    for (const type of Object.keys(EXPECTED) as ChatBusEvent["type"][]) {
      // Fresh client per event so `isInvalidated` reflects THIS event, not a prior one's marks.
      const { invalidate, queryClient, trpc } = setup();
      const keys: Record<TrackedKey, readonly unknown[]> = {
        getChat: trpc.chat.getChat.queryKey({ chatId: CHAT_ID }),
        listMessages: trpc.chat.listMessages.queryKey({ chatId: CHAT_ID }),
        listMessageVariants: trpc.chat.listMessageVariants.queryKey({
          chatId: CHAT_ID,
          messageId: MESSAGE_ID,
        }),
        previewContextFit: trpc.chat.previewContextFit.queryKey({ chatId: CHAT_ID }),
        listChats: trpc.chat.listChats.queryKey(),
        worldInfo: trpc.worldInfo.listBooks.queryKey(),
        characterList: trpc.character.list.queryKey(),
        getGroupConfig: trpc.chat.getGroupConfig.queryKey({ chatId: CHAT_ID }),
        previewAssembly: trpc.chat.previewAssembly.queryKey({ chatId: CHAT_ID }),
        getShapeTrace: trpc.chat.getShapeTrace.queryKey({ chatId: CHAT_ID }),
        revealHidden: trpc.rpg.revealHidden.queryKey({ chatId: CHAT_ID }),
        listChatInjections: trpc.chat.listChatInjections.queryKey({ chatId: CHAT_ID }),
      };
      // Seed every tracked read so `isInvalidated` reflects the FILTER, not an absent cache entry.
      for (const key of Object.values(keys)) {
        queryClient.setQueryData([...key], [] as never);
      }

      invalidate(eventOf(type));

      actual[type] = TRACKED_KEYS.filter((k) => isInvalidated(queryClient, keys[k])).sort();
    }

    // One whole-map assertion → a drift in ANY single event's filters shows exactly which event + which
    // keys changed (far more legible than 26 × 5 bare `toBe`s).
    const expected = Object.fromEntries(Object.entries(EXPECTED).map(([type, ks]) => [type, ks.toSorted()]));
    expect(actual).toEqual(expected);
  });
});

// ── The USER-bus half (PD user-bus lane): the SECOND exhaustive event→filter contract ─────────────
// The reads any `USER_BUS_FILTERS` entry can touch — one representative read per domain root the map
// path-invalidates (pathFilter matches every read under that router, so one seeded read per root suffices).
const USER_TRACKED_KEYS = [
  "character",
  "persona",
  "preset",
  // The preset editor's EFFECTIVE-profile read (`preset.resolveEffective`) — tracked SEPARATELY from `preset`
  // because it has TWO drivers, and the second one is the interesting half: `presetsChanged` covers it via
  // the router root (a knob autosave must re-resolve the funnel), and `settingsChanged` covers it NARROWLY
  // (a model/routing swap changes the capability the funnel clamps against, so every provenance line —
  // "model default", "clamped to 1.2" — would otherwise describe the previous model). Redesign §4.4.
  "presetEffective",
  "worldInfo",
  "tag",
  "themes",
  "userSettings",
  "credentials",
  "chatList",
  "chatGet",
  "connection",
  // The preset params panel's capability gate (`connection.resolveChatCapability`) — a SEPARATE tracked key
  // from `connection` because `settingsChanged` invalidates it NARROWLY (the roleDefaults edit re-resolves the
  // chat capability; the catalog reads under the same router must NOT be dropped — they cold-fetch).
  "chatCapability",
  // The transcript divider's fit budget also refetches on a settings/preset change (the resolved capability +
  // effective params drive the fit) — PD-#7.
  "previewContextFit",
  // The Preview tab's assembled-prompt read — it rides wherever `previewContextFit` does (the fit is that
  // assembly's budget), so a preset/settings edit repaints the preview instead of freezing it at first fetch.
  "previewAssembly",
  // The member-card dialog's read (`chat.getMemberCard`) — a CHAT-scoped projection of a character card, so a
  // card edit is announced on THIS bus, not the chat bus. Without the row the dialog re-opened inside its
  // gcTime window showed the pre-edit card.
  "memberCard",
  // The Analytics dashboard's twelve turn-ECONOMICS reads (`trpc.stats` ROUTER root). The rollups are written
  // in the same `db.batch` as the canon write, and this fan is the moment that batch lands — before the row
  // they had NO driver at all (an open Analytics route froze at mount; a re-open inside gcTime served numbers
  // up to 5 min old). One representative read stands for the router root the map path-invalidates.
  "stats",
  // The refinery workspace router root (`trpc.refinery`) — roster, session view, run ledger, schema
  // library, preflight. Before `refineryChanged` existed these were writer-local: the tab that wrote
  // reconciled and nobody else did (event-bus coverage survey H1).
  "refinery",
  // The CARD DETAIL (`character.get`), tracked SEPARATELY from `character` because the interesting row is
  // the narrow one: a refinery score/analyze run rewrites `characters.refinery.*` through the F6 stamp op,
  // which emits NOTHING of its own, so `refineryChanged` carries the card's provenance readout — while
  // leaving the library list alone (nothing about the roster moved).
  "characterGet",
  // The regex SCRIPT LIBRARY router root (D121-E). Every regex verb emits `regexChanged`, and the library
  // + every scope's attached list live under the one `regex` path — so one coarse member covers the
  // settings pane, the preset/character pickers, and the viewer's display-tier read in one invalidation.
  "regex",
  // The document-bank router root (`trpc.databank`) — library list, one document's detail, the global id
  // set, the "Active in" chips, the per-chat rack. Before `databankChanged` every one of the nine databank
  // mutations named its own reads, and nothing reconciled a SECOND tab (event-bus coverage survey H3).
  "databank",
  // The corpus-analytics router root (`trpc.discovery`) — all 27 dashboard reads. Their writers are
  // background workloads, so before `corpusRecomputed` they had no driver of any kind (§2.5).
  "discovery",
  // `search.similarArt`, tracked SEPARATELY from a search root that deliberately does not exist here: it is
  // pure image-vector cosine written by the same passes, while its `search.*` neighbours are input-keyed
  // live queries that must NOT be dragged into a recompute invalidate.
  "similarArt",
  // An input-keyed live search (`search.search`) — tracked ONLY as the negative control for the row above:
  // it must stay untouched by every member, including `corpusRecomputed`.
  "searchQuery",
  // The VIEWER'S identity (`sessions.me` — userId/handle/globalRole). Before `identityChanged` (W7b) this key
  // was in ZERO rows: an `admin.setRole` grant, or an SSO login elsewhere that renamed the handle, reached a
  // live client only on a full page reload. Tracked separately from `userSettings`/`persona` — the other two
  // legs of the viewer triple — because those two have their own members and would mask a missing row here.
  "sessionsMe",
] as const;
type UserTrackedKey = (typeof USER_TRACKED_KEYS)[number];

// EXHAUSTIVE over `UserBusEvent["type"]`: a new member fails `tsc` HERE until it declares what it
// invalidates — mirroring the `USER_BUS_FILTERS` mapped type it verifies.
const USER_EXPECTED: Record<UserBusEvent["type"], readonly UserTrackedKey[]> = {
  // The character ROOT filter covers `character.get` too — which is why the sweep's terminal
  // `charactersChanged` fan repaints a stamped card's provenance as well as the library's score sort.
  charactersChanged: ["character", "characterGet", "memberCard"],
  personasChanged: ["persona"],
  presetsChanged: ["preset", "presetEffective", "previewContextFit", "previewAssembly"],
  worldInfoChanged: ["worldInfo"],
  regexChanged: ["regex"],
  tagsChanged: ["tag"],
  themesChanged: ["themes"], // NOT userSettings (that's its own member) — the boundary this test pins.
  // NOT themes (its own member). The chat CAPABILITY rides here: Connections persists roleDefaults through
  // `settings.updateUserSettingsSection` (busDriven), so this event is the ONLY freshness driver for the
  // preset params panel's capability gate — the row whose absence kept the editor on its connect-a-model note
  // until a page reload.
  settingsChanged: ["userSettings", "presetEffective", "previewContextFit", "chatCapability", "previewAssembly"],
  credentialsChanged: ["credentials"],
  // With a chatId present, both the list AND the changed chat's detail (the busDriven chat-row coverage), PLUS
  // `character.list` — the CROSS-DEVICE half of the FIX #2 denorm freshness (device B's only chat-derived
  // signal for a character's `lastChattedAt` / chat membership change).
  chatsChanged: ["character", "chatGet", "chatList", "stats"],
  // The refinery root + the card detail, and deliberately NOT the character root: a refinery write moves
  // one card's derived signals, never the library (that is `charactersChanged`'s job). Every persisting
  // refinery verb emits this, which is what turned the whole feature's mutations busDriven.
  refineryChanged: ["refinery", "characterGet"],
  // The databank ROOT and nothing else — the member is coarse because every databank write moves at least
  // two reads under that one router. Notably NOT `chatGet`: a host's attach changes what the ROOM sees, but
  // that half is member-visible state on the chat bus, never a user-bus widening (`membership-fan-guard`).
  databankChanged: ["databank"],
  // The discovery ROOT + `search.similarArt`, and deliberately NOT `searchQuery`: the live search reads are
  // input-keyed (the typed query IS the cache key), so invalidating them on a background recompute would
  // re-run someone's search for no freshness gain. That exclusion is the point of the negative control.
  corpusRecomputed: ["discovery", "similarArt"],
  // The VIEWER TRIPLE and nothing else (W7b) — `sessions.me` plus the two composites `use-viewer.ts` derives
  // `currentPersona` from. It routes through the SAME `identityFilters` helper the recovery ladder's resume
  // rung calls, so this row is also the pin that the bus half and the ladder half cannot drift apart.
  // Deliberately NOT the character/chat roots: a role grant changes what the viewer may DO, not what they own.
  identityChanged: ["sessionsMe", "userSettings", "persona"],
  // DEFERRED member — never emitted, but the map entry is live; it path-invalidates the WHOLE connection
  // router, so the capability read under it goes stale too.
  connectionsChanged: ["connection", "chatCapability"],
};

// The user events carry no chatId EXCEPT `chatsChanged` (which reads it for the getChat branch). A `chatId`
// on every event is harmless (only `chatsChanged` reads it), so one shape exercises every path.
function userEventOf(type: UserBusEvent["type"]): UserBusEvent {
  return { type, chatId: CHAT_ID } as unknown as UserBusEvent;
}

describe("invalidation — the USER-bus half (invalidateUser)", () => {
  test("the event→filter contract holds for EVERY UserBusEvent type", () => {
    const actual: Record<string, readonly UserTrackedKey[]> = {};

    for (const type of Object.keys(USER_EXPECTED) as UserBusEvent["type"][]) {
      const { invalidateUser, queryClient, trpc } = setup();
      const keys: Record<UserTrackedKey, readonly unknown[]> = {
        character: trpc.character.list.queryKey(),
        persona: trpc.persona.list.queryKey(),
        preset: trpc.preset.list.queryKey(),
        presetEffective: trpc.preset.resolveEffective.queryKey({ id: PRESET_ID }),
        worldInfo: trpc.worldInfo.listBooks.queryKey(),
        regex: trpc.regex.listScripts.queryKey(),
        tag: trpc.tag.listTags.queryKey(),
        themes: trpc.settings.listThemes.queryKey(),
        userSettings: trpc.settings.getUserSettings.queryKey(),
        credentials: trpc.credentials.list.queryKey(),
        chatList: trpc.chat.listChats.queryKey(),
        chatGet: trpc.chat.getChat.queryKey({ chatId: CHAT_ID }),
        connection: trpc.connection.getCatalog.queryKey(),
        chatCapability: trpc.connection.resolveChatCapability.queryKey(),
        previewContextFit: trpc.chat.previewContextFit.queryKey({ chatId: CHAT_ID }),
        previewAssembly: trpc.chat.previewAssembly.queryKey({ chatId: CHAT_ID }),
        memberCard: trpc.chat.getMemberCard.queryKey({ chatId: CHAT_ID, characterId: CHARACTER_ID }),
        stats: trpc.stats.overview.queryKey(),
        refinery: trpc.refinery.listSessions.queryKey(),
        characterGet: trpc.character.get.queryKey({ characterId: CHARACTER_ID }),
        databank: trpc.databank.list.queryKey({}),
        discovery: trpc.discovery.home.queryKey(),
        similarArt: trpc.search.similarArt.queryKey({ characterId: CHARACTER_ID }),
        searchQuery: trpc.search.search.queryKey({ query: "anything" }),
        sessionsMe: trpc.sessions.me.queryKey(),
      };
      for (const key of Object.values(keys)) {
        queryClient.setQueryData([...key], [] as never);
      }

      invalidateUser(userEventOf(type));

      actual[type] = USER_TRACKED_KEYS.filter((k) => isInvalidated(queryClient, keys[k])).sort();
    }

    const expected = Object.fromEntries(Object.entries(USER_EXPECTED).map(([type, ks]) => [type, ks.toSorted()]));
    expect(actual).toEqual(expected);
  });

  test("chatsChanged WITHOUT a chatId (the message-commit terminal fan) drives list + character, NOT getChat", () => {
    // The server's terminal-path member-fan omits `chatId` (the per-chat bus already drives the open chat's
    // `getChat`) — so this branch must invalidate `listChats` + `character.list` and leave `getChat` alone
    // (carrying it would triple-invalidate `getChat` inside the commit+complete window and trip the dup alarm).
    const { invalidateUser, queryClient, trpc } = setup();
    const chatList = trpc.chat.listChats.queryKey();
    const character = trpc.character.list.queryKey();
    const chatGet = trpc.chat.getChat.queryKey({ chatId: CHAT_ID });
    // The turn-economics rollups land on this SAME terminal fan — the chatId-less branch is the one a plain
    // turn takes, so if the stats row rode only the lifecycle branch the dashboard would still never move.
    const stats = trpc.stats.overview.queryKey();
    for (const key of [chatList, character, chatGet, stats]) {
      queryClient.setQueryData([...key], [] as never);
    }

    invalidateUser({ type: "chatsChanged" });

    expect(isInvalidated(queryClient, chatList)).toBe(true);
    expect(isInvalidated(queryClient, character)).toBe(true);
    expect(isInvalidated(queryClient, stats)).toBe(true);
    expect(isInvalidated(queryClient, chatGet)).toBe(false);
  });

  test("invalidateAllUserRoots (the reconnect gap-heal) marks EVERY user root stale", () => {
    const { invalidateAllUserRoots, queryClient, trpc } = setup();
    const roots = [
      trpc.character.list.queryKey(),
      trpc.persona.list.queryKey(),
      trpc.preset.list.queryKey(),
      trpc.worldInfo.listBooks.queryKey(),
      trpc.tag.listTags.queryKey(),
      trpc.settings.listThemes.queryKey(),
      trpc.settings.getUserSettings.queryKey(),
      trpc.credentials.list.queryKey(),
      trpc.chat.listChats.queryKey(),
      trpc.connection.getCatalog.queryKey(),
      trpc.connection.resolveChatCapability.queryKey(),
      trpc.stats.overview.queryKey(),
      // The refinery root joined the heal set the moment `refineryChanged` joined the map — the set is
      // DERIVED from `USER_BUS_EVENT_TYPES`, so this row is a pin on that derivation, not a second list.
      trpc.refinery.listSessions.queryKey(),
      // Same derivation, same lane: the databank + corpus-analytics roots joined the blanket heal the moment
      // their members joined the map. This matters more here than for most members, because BOTH new planes
      // are live-only and their producers are background passes — a reconnect that missed a sweep is exactly
      // the gap the blanket exists to close.
      trpc.databank.list.queryKey({}),
      trpc.discovery.home.queryKey(),
      trpc.search.similarArt.queryKey({ characterId: CHARACTER_ID }),
      // THE VIEWER'S OWN IDENTITY (W7b). Red-first pin, and the one root whose absence was the whole D5 gap:
      // `sessions.me` had NO bus member, so it was unreachable through this DERIVED heal set — a device that
      // was offline while an admin granted it a role came back, reconnected, healed every other root, and
      // still rendered the pre-grant role forever (staleTime is Infinity; nothing else re-reads it). The
      // reconnect case matters more for identity than for any other member because the write happens on
      // SOMEBODY ELSE'S request, so this device never had a local signal at all.
      trpc.sessions.me.queryKey(),
    ];
    for (const key of roots) {
      queryClient.setQueryData([...key], [] as never);
    }

    invalidateAllUserRoots();

    for (const key of roots) {
      expect(isInvalidated(queryClient, key)).toBe(true);
    }
  });
});

// ── The RPG-bus half (§4.9 feature-root game bus): the THIRD exhaustive event→filter contract ─────
// LIVE-ONLY like the user bus. W3b WIRED the `RPG_BUS_FILTERS` handlers to the real rpg reads (`trpc.rpg.
// getTrackerView`/`getGame`/`getConfigView`/`listJournal`), so this pins: the map is EXHAUSTIVE over
// `RpgBusEvent["type"]` (a new member fails tsc in `RPG_BUS_FILTERS` until it names its reads), `invalidateRpg`
// dispatches every member without throwing, and each event marks its own reads stale (snapshotPatched→tracker,
// gameChanged→game+config). `gapHealRpg` (the reconnect blanket) marks every read the open game covers.
// A REAL minimal `RpgBusEvent` per type — no cast, no fabrication (the members carry only `type` + `chatId` +
// an optional/required branded id, so a real literal satisfies the type exactly). Total over the union: a new
// member fails `tsc` here until it names a real event, mirroring the `RPG_BUS_FILTERS` mapped type.
const RPG_EVENTS: Record<RpgBusEvent["type"], RpgBusEvent> = {
  gameChanged: { type: "gameChanged", chatId: CHAT_ID },
  snapshotPatched: { type: "snapshotPatched", chatId: CHAT_ID, snapshotId: castId<RpgSnapshotId>("rpg_snapshot_invalidationtest") },
  sheetChanged: { type: "sheetChanged", chatId: CHAT_ID, sheetId: castId<RpgSheetId>("rpg_sheet_invalidationtest") },
  questChanged: { type: "questChanged", chatId: CHAT_ID },
  journalChanged: { type: "journalChanged", chatId: CHAT_ID },
  turnToolCallsRecorded: { type: "turnToolCallsRecorded", chatId: CHAT_ID },
};

// The rpg reads any `RPG_BUS_FILTERS` entry can touch (one per read the map names). EXHAUSTIVE over
// `RpgBusEvent["type"]`: a new member fails `tsc` HERE until it declares what it invalidates.
const RPG_TRACKED_KEYS = ["game", "tracker", "config", "journal", "reveal", "turnToolCalls"] as const;
type RpgTrackedKey = (typeof RPG_TRACKED_KEYS)[number];
const RPG_EXPECTED: Record<RpgBusEvent["type"], readonly RpgTrackedKey[]> = {
  gameChanged: ["game", "config", "reveal"],
  snapshotPatched: ["tracker"],
  sheetChanged: ["tracker"],
  questChanged: ["tracker"],
  journalChanged: ["journal"],
  // TOOLCALLS-INVISIBLE arm A — its OWN driver, not `snapshotPatched`'s: a turn whose calls all dropped
  // writes a record and NO snapshot, and that is exactly the turn the disclosure exists for.
  turnToolCallsRecorded: ["turnToolCalls"],
};

describe("invalidation — the RPG-bus half (invalidateRpg)", () => {
  test("invalidateRpg dispatches EVERY RpgBusEvent type without throwing (the belt is total)", () => {
    const { invalidateRpg } = setup();
    for (const type of RPG_BUS_EVENT_TYPES) {
      expect(() => invalidateRpg(RPG_EVENTS[type])).not.toThrow();
    }
  });

  test("the event→reads contract holds for EVERY RpgBusEvent type", () => {
    const actual: Record<string, readonly RpgTrackedKey[]> = {};
    for (const type of RPG_BUS_EVENT_TYPES) {
      // Fresh client per event so `isInvalidated` reflects THIS event, not a prior one's marks.
      const { invalidateRpg, queryClient, trpc } = setup();
      const keys: Record<RpgTrackedKey, readonly unknown[]> = {
        game: trpc.rpg.getGame.queryKey({ chatId: CHAT_ID }),
        tracker: trpc.rpg.getTrackerView.queryKey({ chatId: CHAT_ID }),
        config: trpc.rpg.getConfigView.queryKey({ chatId: CHAT_ID }),
        journal: trpc.rpg.listJournal.queryKey({ chatId: CHAT_ID }),
        reveal: trpc.rpg.revealHidden.queryKey({ chatId: CHAT_ID }),
        turnToolCalls: trpc.rpg.listTurnToolCalls.queryKey({ chatId: CHAT_ID }),
      };
      // Seed every tracked read so `isInvalidated` reflects the FILTER, not an absent cache entry (the chat/
      // user belt idiom — the read types are heterogeneous objects, so the sanctioned `[] as never` seed).
      for (const key of Object.values(keys)) {
        queryClient.setQueryData([...key], [] as never);
      }

      invalidateRpg(RPG_EVENTS[type]);

      actual[type] = RPG_TRACKED_KEYS.filter((k) => isInvalidated(queryClient, keys[k])).sort();
    }
    const expected = Object.fromEntries(Object.entries(RPG_EXPECTED).map(([type, ks]) => [type, ks.toSorted()]));
    expect(actual).toEqual(expected);
  });

  test("gapHealRpg (the reconnect blanket) marks every read the open game covers stale", () => {
    const { gapHealRpg, queryClient, trpc } = setup();
    const keys = [
      trpc.rpg.getGame.queryKey({ chatId: CHAT_ID }),
      trpc.rpg.getTrackerView.queryKey({ chatId: CHAT_ID }),
      trpc.rpg.getConfigView.queryKey({ chatId: CHAT_ID }),
      trpc.rpg.revealHidden.queryKey({ chatId: CHAT_ID }),
      trpc.rpg.listTurnToolCalls.queryKey({ chatId: CHAT_ID }),
    ];
    for (const key of keys) {
      queryClient.setQueryData([...key], [] as never);
    }

    gapHealRpg(CHAT_ID);

    for (const key of keys) {
      expect(isInvalidated(queryClient, key)).toBe(true);
    }
  });
});

// ── The WAVE COLLAPSE: what a wave SPENDS, not what it covers ─────────────────────────────────────
// Every filter above pins COVERAGE (`isInvalidated`), which a redundant row can never break — it is
// idempotent as a mark. The cost is invisible there and real on the wire: `invalidateQueries` does NOT dedupe
// against an in-flight fetch, it CANCELS and restarts it, so a second filter covering the same query is a
// second round trip. The gap-heal set is the UNION of every user-map row, so overlaps are structural: W7b's
// `identityChanged` mapped `persona.list` while `personasChanged` already carried the `persona` ROOT, and
// every reconnect fetched personas twice (caught on the wire by
// `tests/client/data/bus/use-user-bus.ct.tsx:77` — persona.list 3, expected 2). These pin the collapse that
// closed it, at the tier that can SEE a spend: the count of `invalidateQueries` calls one wave makes.

/** A filter's tRPC key parts: the dotted path, and whether it narrows further (an input/type object). */
function keyParts(filter: unknown): { readonly path: readonly string[]; readonly narrowed: boolean } {
  const queryKey = (filter as { readonly queryKey?: readonly unknown[] }).queryKey ?? [];
  const path = Array.isArray(queryKey[0]) ? (queryKey[0] as string[]) : [];
  return { path, narrowed: queryKey.length > 1 };
}

/** Does `a` reach every query `b` does? react-query matches a key by partial PREFIX, so an un-narrowed
 *  path that prefixes another's names a strictly wider set (`["persona"]` covers `["persona","list"]`). */
function covers(a: unknown, b: unknown): boolean {
  const left = keyParts(a);
  const right = keyParts(b);
  return !left.narrowed && left.path.every((segment, i) => right.path[i] === segment);
}

/** Record what a wave actually SPENDS on the client — one entry per `invalidateQueries` call, in order.
 *  The client is per-test (see `setup`), so the spy needs no restore. */
function recordSpend(queryClient: QueryClient): { readonly filters: () => readonly unknown[] } {
  const spy = vi.spyOn(queryClient, "invalidateQueries").mockResolvedValue(undefined);
  return { filters: (): readonly unknown[] => spy.mock.calls.map(([filter]) => filter) };
}

describe("invalidation — the wave collapse (what a wave SPENDS)", () => {
  test("the reconnect gap-heal spends ONE invalidateQueries per distinct root — no covered filter survives", () => {
    const { invalidateAllUserRoots, queryClient } = setup();
    const recorder = recordSpend(queryClient);

    invalidateAllUserRoots();

    const spent = recorder.filters();

    const redundant = spent.flatMap((filter, i) =>
      spent
        .filter((other, j) => i !== j && covers(other, filter))
        .map((other) => `${keyParts(filter).path.join(".")} is already covered by ${keyParts(other).path.join(".")}`),
    );
    expect(redundant).toEqual([]);
    // The specific pair that was costing a double fetch: the persona ROOT survives, its narrower sibling does not.
    const paths = spent.map((filter) => keyParts(filter).path.join("."));
    expect(paths).toContain("persona");
    expect(paths).not.toContain("persona.list");
  });

  test("the collapse is order-independent — a broad filter arriving AFTER the narrow one still wins", () => {
    const { invalidateFilters, queryClient, trpc } = setup();
    const recorder = recordSpend(queryClient);

    invalidateFilters([trpc.persona.list.pathFilter(), trpc.persona.pathFilter()]);

    expect(recorder.filters().map((filter) => keyParts(filter).path.join("."))).toEqual(["persona"]);
  });

  test("a narrower filter with no broader sibling is untouched (the collapse drops coverage from nothing)", () => {
    const { invalidateFilters, queryClient, trpc } = setup();
    const listTagsKey = trpc.tag.listTags.queryKey();
    const personaKey = trpc.persona.list.queryKey();
    for (const key of [listTagsKey, personaKey]) {
      queryClient.setQueryData([...key], [] as never);
    }

    invalidateFilters([trpc.persona.list.pathFilter(), trpc.tag.listTags.pathFilter()]);

    expect(isInvalidated(queryClient, personaKey)).toBe(true);
    expect(isInvalidated(queryClient, listTagsKey)).toBe(true);
  });
});

describe("invalidation — the mutation half (invalidateFilters)", () => {
  test("createEntityMutation's onSettled chokepoint marks its target filter stale", () => {
    const { invalidateFilters, queryClient, trpc } = setup();
    const listTagsKey = trpc.tag.listTags.queryKey();
    queryClient.setQueryData(listTagsKey, []);
    expect(isInvalidated(queryClient, listTagsKey)).toBe(false);

    invalidateFilters([trpc.tag.listTags.queryFilter()]);

    expect(isInvalidated(queryClient, listTagsKey)).toBe(true);
  });

  test("invalidateFilters with an empty array (an event's explicit []) touches nothing", () => {
    const { invalidateFilters, queryClient, trpc } = setup();
    const listTagsKey = trpc.tag.listTags.queryKey();
    queryClient.setQueryData(listTagsKey, []);

    invalidateFilters([]);

    expect(isInvalidated(queryClient, listTagsKey)).toBe(false);
  });
});
