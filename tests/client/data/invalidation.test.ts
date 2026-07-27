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
import type { ChatId, MessageId, RpgSheetId, RpgSnapshotId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { QueryClient } from "@tanstack/react-query";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures";

const CHAT_ID = castId<ChatId>("chat_invalidationtest");
const MESSAGE_ID = castId<MessageId>("msg_invalidationtest0");

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
] as const;
type TrackedKey = (typeof TRACKED_KEYS)[number];

// The OPEN chat's DETAIL reads (`chatDetailReads` in invalidation.ts) — NO chat list. The canon-TERMINAL events
// (messageCommitted/turnCompleted) use this: the chat LIST + character library recency rides the server's
// `chatsChanged` member-fan on the same moment (one driver per surface, no triple-invalidate).
const CHAT_DETAIL_READS: readonly TrackedKey[] = ["getChat", "listMessages", "listMessageVariants", "previewContextFit"];

// The full room+list refetch (`chatReads` = detail + `listChats`) — the NON-terminal canon events that fire no
// server `chatsChanged` (edit/hide/reorder/delete/select/abort) keep `listChats` as their same-device driver.
const CHAT_READS: readonly TrackedKey[] = [...CHAT_DETAIL_READS, "listChats"];

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
  // The canon-TERMINAL commits (messageCommitted/turnCompleted) refetch the OPEN chat's DETAIL only — the chat
  // LIST (`listChats`) + character library (`characterList`) recency rides the server's `chatsChanged`
  // member-fan on the same moment (one driver per surface, no triple-invalidate). Non-terminal canon mutations
  // (edit/hide/select/delete/reorder/abort) fire no server `chatsChanged`, so they keep the full `chatReads`.
  messageCommitted: CHAT_DETAIL_READS,
  messageEdited: CHAT_READS,
  messageHidden: CHAT_READS,
  variantSelected: CHAT_READS,
  messagesDeleted: CHAT_READS,
  messagesReordered: CHAT_READS,
  reasoningEdited: CHAT_READS,
  reasoningCleared: CHAT_READS,
  turnCompleted: CHAT_DETAIL_READS,
  turnAborted: CHAT_READS,
  chatDeleted: CHAT_READS,
  // The roster/group/override/membership catch-all — the full room+list refetch PLUS the Group tab's own
  // `getGroupConfig` read (the only bus arm that carries it; proven cross-tab by
  // tests/e2e/multi-tab-room-sync.spec.ts).
  chatUpdated: [...CHAT_READS, "getGroupConfig"],
  // Room-only.
  personaSwitched: ["getChat"],
  chatOpened: ["getChat"],
  historyTruncated: ["getChat"],
  // World-info attachment — the WI reads + the room (assembly pool changed).
  wiBookAttached: ["worldInfo", "getChat"],
  wiBookDetached: ["worldInfo", "getChat"],
  wiEntryAttached: ["worldInfo", "getChat"],
  wiEntryDetached: ["worldInfo", "getChat"],
  wiEntryScopeChanged: ["worldInfo", "getChat"],
  // Chat-row lifecycle.
  chatCreated: ["listChats"],
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
    const expected = Object.fromEntries(Object.entries(EXPECTED).map(([type, ks]) => [type, [...ks].sort()]));
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
  "worldInfo",
  "tag",
  "themes",
  "userSettings",
  "credentials",
  "chatList",
  "chatGet",
  "connection",
  // The transcript divider's fit budget also refetches on a settings/preset change (the resolved capability +
  // effective params drive the fit) — PD-#7.
  "previewContextFit",
] as const;
type UserTrackedKey = (typeof USER_TRACKED_KEYS)[number];

// EXHAUSTIVE over `UserBusEvent["type"]`: a new member fails `tsc` HERE until it declares what it
// invalidates — mirroring the `USER_BUS_FILTERS` mapped type it verifies.
const USER_EXPECTED: Record<UserBusEvent["type"], readonly UserTrackedKey[]> = {
  charactersChanged: ["character"],
  personasChanged: ["persona"],
  presetsChanged: ["preset", "previewContextFit"],
  worldInfoChanged: ["worldInfo"],
  tagsChanged: ["tag"],
  themesChanged: ["themes"], // NOT userSettings (that's its own member) — the boundary this test pins.
  settingsChanged: ["userSettings", "previewContextFit"], // NOT themes.
  credentialsChanged: ["credentials"],
  // With a chatId present, both the list AND the changed chat's detail (the busDriven chat-row coverage), PLUS
  // `character.list` — the CROSS-DEVICE half of the FIX #2 denorm freshness (device B's only chat-derived
  // signal for a character's `lastChattedAt` / chat membership change).
  chatsChanged: ["character", "chatGet", "chatList"],
  connectionsChanged: ["connection"], // DEFERRED member — never emitted, but the map entry is live.
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
        worldInfo: trpc.worldInfo.listBooks.queryKey(),
        tag: trpc.tag.listTags.queryKey(),
        themes: trpc.settings.listThemes.queryKey(),
        userSettings: trpc.settings.getUserSettings.queryKey(),
        credentials: trpc.credentials.list.queryKey(),
        chatList: trpc.chat.listChats.queryKey(),
        chatGet: trpc.chat.getChat.queryKey({ chatId: CHAT_ID }),
        connection: trpc.connection.getCatalog.queryKey(),
        previewContextFit: trpc.chat.previewContextFit.queryKey({ chatId: CHAT_ID }),
      };
      for (const key of Object.values(keys)) {
        queryClient.setQueryData([...key], [] as never);
      }

      invalidateUser(userEventOf(type));

      actual[type] = USER_TRACKED_KEYS.filter((k) => isInvalidated(queryClient, keys[k])).sort();
    }

    const expected = Object.fromEntries(Object.entries(USER_EXPECTED).map(([type, ks]) => [type, [...ks].sort()]));
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
    for (const key of [chatList, character, chatGet]) {
      queryClient.setQueryData([...key], [] as never);
    }

    invalidateUser({ type: "chatsChanged" });

    expect(isInvalidated(queryClient, chatList)).toBe(true);
    expect(isInvalidated(queryClient, character)).toBe(true);
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
};

// The rpg reads any `RPG_BUS_FILTERS` entry can touch (one per read the map names). EXHAUSTIVE over
// `RpgBusEvent["type"]`: a new member fails `tsc` HERE until it declares what it invalidates.
const RPG_TRACKED_KEYS = ["game", "tracker", "config", "journal"] as const;
type RpgTrackedKey = (typeof RPG_TRACKED_KEYS)[number];
const RPG_EXPECTED: Record<RpgBusEvent["type"], readonly RpgTrackedKey[]> = {
  gameChanged: ["game", "config"],
  snapshotPatched: ["tracker"],
  sheetChanged: ["tracker"],
  questChanged: ["tracker"],
  journalChanged: ["journal"],
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
      };
      // Seed every tracked read so `isInvalidated` reflects the FILTER, not an absent cache entry (the chat/
      // user belt idiom — the read types are heterogeneous objects, so the sanctioned `[] as never` seed).
      for (const key of Object.values(keys)) {
        queryClient.setQueryData([...key], [] as never);
      }

      invalidateRpg(RPG_EVENTS[type]);

      actual[type] = RPG_TRACKED_KEYS.filter((k) => isInvalidated(queryClient, keys[k])).sort();
    }
    const expected = Object.fromEntries(Object.entries(RPG_EXPECTED).map(([type, ks]) => [type, [...ks].sort()]));
    expect(actual).toEqual(expected);
  });

  test("gapHealRpg (the reconnect blanket) marks every read the open game covers stale", () => {
    const { gapHealRpg, queryClient, trpc } = setup();
    const keys = [
      trpc.rpg.getGame.queryKey({ chatId: CHAT_ID }),
      trpc.rpg.getTrackerView.queryKey({ chatId: CHAT_ID }),
      trpc.rpg.getConfigView.queryKey({ chatId: CHAT_ID }),
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
