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
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { ChatId, MessageId } from "@orb/kit/ids";
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
  return (
    queryClient.getQueryCache().find({ queryKey: [...queryKey] })?.state.isInvalidated ?? false
  );
}

// ── The exhaustive event→filter contract ─────────────────────────────────────────────────────────
// The five reads any `BUS_FILTERS` entry can touch. A new invalidation TARGET beyond these needs a new
// tracked key here (the seed + assert loop then covers it). Declared as a tuple (the axis lives once),
// with the union derived — `no-inline-union-redecl`.
const TRACKED_KEYS = [
  "getChat",
  "listMessages",
  "listMessageVariants",
  "listChats",
  "worldInfo",
] as const;
type TrackedKey = (typeof TRACKED_KEYS)[number];

// The full room+list refetch (`chatReads` in invalidation.ts) — named once so the table below stays legible.
const CHAT_READS: readonly TrackedKey[] = [
  "getChat",
  "listMessages",
  "listMessageVariants",
  "listChats",
];

// The freshness contract in ONE readable table, EXHAUSTIVE over `ChatBusEvent["type"]`: a new bus member
// fails `tsc` HERE (the `Record<…>` is total) until it declares what it invalidates — mirroring the
// `BUS_FILTERS` mapped type it verifies. Change a `BUS_FILTERS` entry and the exhaustive test below drifts red.
const EXPECTED: Record<ChatBusEvent["type"], readonly TrackedKey[]> = {
  // Stream-transient — no read model changes until a terminal/canon event.
  delta: [],
  reasoningStreamDone: [],
  turnStarted: [],
  warning: [],
  worldInfoActivated: [], // per-turn trace; no query reads it
  // Canon mutations + turn terminals — the full room + list refetch.
  messageCommitted: CHAT_READS,
  messageEdited: CHAT_READS,
  messageHidden: CHAT_READS,
  variantSelected: CHAT_READS,
  messagesDeleted: CHAT_READS,
  messagesReordered: CHAT_READS,
  reasoningEdited: CHAT_READS,
  reasoningCleared: CHAT_READS,
  turnCompleted: CHAT_READS,
  turnAborted: CHAT_READS,
  chatDeleted: CHAT_READS,
  chatUpdated: CHAT_READS,
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
        listChats: trpc.chat.listChats.queryKey(),
        worldInfo: trpc.worldInfo.listBooks.queryKey(),
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
    const expected = Object.fromEntries(
      Object.entries(EXPECTED).map(([type, ks]) => [type, [...ks].sort()]),
    );
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
] as const;
type UserTrackedKey = (typeof USER_TRACKED_KEYS)[number];

// EXHAUSTIVE over `UserBusEvent["type"]`: a new member fails `tsc` HERE until it declares what it
// invalidates — mirroring the `USER_BUS_FILTERS` mapped type it verifies.
const USER_EXPECTED: Record<UserBusEvent["type"], readonly UserTrackedKey[]> = {
  charactersChanged: ["character"],
  personasChanged: ["persona"],
  presetsChanged: ["preset"],
  worldInfoChanged: ["worldInfo"],
  tagsChanged: ["tag"],
  themesChanged: ["themes"], // NOT userSettings (that's its own member) — the boundary this test pins.
  settingsChanged: ["userSettings"], // NOT themes.
  credentialsChanged: ["credentials"],
  // With a chatId present, both the list AND the changed chat's detail (the busDriven chat-row coverage).
  chatsChanged: ["chatGet", "chatList"],
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
      };
      for (const key of Object.values(keys)) {
        queryClient.setQueryData([...key], [] as never);
      }

      invalidateUser(userEventOf(type));

      actual[type] = USER_TRACKED_KEYS.filter((k) => isInvalidated(queryClient, keys[k])).sort();
    }

    const expected = Object.fromEntries(
      Object.entries(USER_EXPECTED).map(([type, ks]) => [type, [...ks].sort()]),
    );
    expect(actual).toEqual(expected);
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
