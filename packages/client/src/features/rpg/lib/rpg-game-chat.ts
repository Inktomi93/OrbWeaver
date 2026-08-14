// The ONE game-ness predicate the rpg CONTEXT contributions gate on (HUD-1 §3.4) — extracted so the tab
// contributions and the whole-pane HUD CLAIM cannot disagree about what "this chat is a game" means. One
// predicate, one answer: a claimed pane and its tabs appear and disappear together.
//
// SELF-CONTAINED cross-domain read (lockdown §12 matrix — a feature reads ANOTHER domain's server entity via
// a CACHE-FIRST `trpc.*` read, never by importing that feature): it reads the rpg POINTER off `chat.getChat`
// CACHE-FIRST. `chat` already holds that query (`useChatContextState` suspense-fetches it), so `getQueryData`
// is a pure cache read with no round-trip; and because chats' own `useResolved` subscribes to that query, the
// predicate re-evaluates when it settles. The door injects the `queryClient` + `trpc` proxy (both singletons
// it already owns), so this stays a plain function (no hooks) while still reading `#data`'s cross-domain
// channel — never chat's client.

import { isRpgEngaged } from "@orb/contracts/rpg";
import type { QueryClient } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { peekQueryData } from "#data";
import type { ChatContextState, CommittedChatContext } from "#lib";

type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;

/** The door-injected cross-domain read channel — the singleton `queryClient` + `trpc` proxy `main.tsx` owns. */
export interface RpgContextTabsDeps {
  readonly trpc: Trpc;
  readonly queryClient: QueryClient;
}

/** The cached `chat.getChat` for a committed chat, or `undefined` while uncached. */
export function peekChatDetail(deps: RpgContextTabsDeps, s: CommittedChatContext): ChatDetail | undefined {
  return peekQueryData<ChatDetail>(deps.queryClient, deps.trpc.chat.getChat.queryKey({ chatId: s.chatId }));
}

/** Is this a game chat? THE applicability gate for every rpg CONTEXT contribution — a committed chat whose
 *  CACHED `getChat` carries an ENGAGED rpg pointer (`undefined` while uncached ⇒ false, re-evaluated when
 *  the query settles). A DISENGAGED game (pointer `engaged:false`) reads exactly like a non-game chat: the
 *  claim drops, the game tabs go, and the host-only Game tab stays as the re-enable door. */
export function makeIsGameChat(deps: RpgContextTabsDeps): (s: ChatContextState) => s is CommittedChatContext {
  // Single-arm union today (see rpg-context-section's twin note) — phase narrowing returns with arm 2.
  return (s: ChatContextState): s is CommittedChatContext => {
    const detail = peekChatDetail(deps, s);
    return detail !== undefined && isRpgEngaged(detail.rpg ?? null);
  };
}
