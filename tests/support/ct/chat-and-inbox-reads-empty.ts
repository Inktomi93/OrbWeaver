// The TWO reads a composition mount reaches for beyond its own subject — `chat.listChats` (the rail's
// library roster / the home masthead+recents readers) and `notifications.list` (the topbar-trail inbox
// bell, #1663 — it mounts for every authed principal since #1627 retired its `multiHumanCapable` gate).
// Neither is the SUBJECT of the CTs that hit this file (#1817, the #1797 whole-tree census on 46004b6c2):
// `chat.listChats` fires because `CharacterCreateActions`/`AppShell` sit beside chat-aware chrome, and
// `notifications.list` fires because the shell always mounts the bell. Left unfed, `routeTrpc`'s lenient
// `{result:{data:null}}` answers each with `null`, which is not a view — a suspending reader throws on it
// and its `QueryBoundary` swaps the section body for `QueryErrorState`, invisible to any assertion outside
// that boundary (`route-trpc.ts` header, #629).
//
// THE SAME PRECEDENT AS `regex-reads-empty.ts`: fed with the QUIETEST TRUE STATE, typed against whatever
// piece of the wire the `tests/` tree CAN name. `ChatListPage`'s full shape is `inferOutput<Trpc["chat"]
// ["listChats"]>` in production (`use-chat-list-collection.ts`) — but the tests tree carries no
// `@trpc/tanstack-react-query` dep to spell that with (the same constraint `_ct-stories.tsx`'s
// `useEchoingSectionUpdate` records), so the page is shaped by hand against the two contract pieces that
// ARE exported (`ChatListCursor`; `items` is `[]`, so its row type is moot). `notifications.list`'s
// `InboxView` row type IS exported, so that half is pinned exactly.
import type { ChatListCursor } from "@orb/contracts/chat";
import type { InboxView } from "@orb/contracts/notifications";

/** The honest "no chats yet" page (`ChatListPage`'s empty arm) — the same default the home masthead /
 *  library resume-strip readers compose over (character-library-surface.tsx, home-masthead-body.tsx). */
interface EmptyChatListPage {
  readonly items: readonly [];
  readonly nextCursor: ChatListCursor | null;
  readonly totalCount: number;
}

/** The honest "nothing in the inbox" page — the bell's real empty-inbox lens rather than its error arm. */
interface EmptyInboxPage {
  readonly items: readonly InboxView[];
  readonly nextCursor: number | null;
}

const EMPTY_CHAT_LIST: EmptyChatListPage = { items: [], nextCursor: null, totalCount: 0 };
const EMPTY_INBOX: EmptyInboxPage = { items: [], nextCursor: null };

/** Spread into a `routeTrpc` map by any CT that mounts chat-aware chrome (the rail, the shell, a
 *  composition story) for a reason of its own. */
export const CHAT_AND_INBOX_READS_EMPTY = {
  "chat.listChats": (): EmptyChatListPage => EMPTY_CHAT_LIST,
  "notifications.list": (): EmptyInboxPage => EMPTY_INBOX,
} as const;
