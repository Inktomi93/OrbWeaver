// The rpg CONTEXT-panel projection hook (client-architecture-lockdown.md §6b; Context-Panel-Program §4.1)
// — resolves the active game chat into the takeover's panel state, or `null` when the chat carries no game.
// The takeover is APPLICABILITY (§4.1): it renders only when `chat.rpg !== null` (the pointer already on
// `chat.getChat`, read off data the panel already holds — no per-chat probe on every switch). When a game
// exists, the mode/read-only trim (`rpg.getGame`) + the whole tracker aggregate (`rpg.getTrackerView`)
// suspense-fetch together, both keyed by `chatId`. Both reads run `staleTime: Infinity` under the query
// client default — the rpg bus (`use-rpg-bus.ts`) is their freshness driver.
//
// All reads are unconditional (rules-of-hooks). The `useSuspenseQueries` dynamic-array idiom (the
// `use-chat-context-state.ts` precedent) suspends ONLY when a game is present — a `null`-on-pending would
// flash the placeholder (a lying state). SELF-CONTAINED (lockdown §12): the hook takes only `chatId` and
// re-reads `chat.getChat` ITSELF (cache-first, deduped — chat already holds it), deriving the pointer AND
// the viewer identity (`viewerUserId`/`viewerIsHost`) from that ONE cross-domain read — it imports NOTHING
// from `features/chat` and never widens chat's client projection.

import type { RpgGameView, RpgTrackerView } from "@orb/contracts/rpg";
import type { ChatId, UserId } from "@orb/kit/ids";
import { useSuspenseQueries } from "@tanstack/react-query";
import { useTRPC } from "#data";

/** The resolved takeover panel state the game tabs + header render. `null` (from the hook) ⇒ this chat is
 *  not a game (the tab's `when` hides it). `viewerUserId`/`isHost` are derived from the SAME `chat.getChat`
 *  cross-domain read; the game reads supply `game`/`tracker`. `canEditShared` folds the honest-arms + host
 *  gate the shared-plane edits (snapshot/quest/widget — host-only in v1) obey; `viewerUserId` lets the Sheet
 *  tab offer the member-own edit arm (`patchSheet` allows a member their own `user` ref). */
export interface RpgPanelState {
  readonly chatId: ChatId;
  readonly viewerUserId: UserId;
  readonly isHost: boolean;
  readonly game: RpgGameView;
  readonly tracker: RpgTrackerView;
  /** Shared-plane edits are enabled only for a host on a writable game (§4.4 read-only pill = honest arm). */
  readonly canEditShared: boolean;
}

/** Resolve the active game chat into its takeover panel state, or `null` when the chat is not a game.
 *  Fully self-contained: reads `chat.getChat` (cache-first) for the pointer + viewer identity, then the two
 *  rpg reads. Suspends only once a game is confirmed present. */
export function useRpgContextState(chatId: ChatId): RpgPanelState | null {
  const trpc = useTRPC();
  // The chat detail read — the cross-domain source of the rpg pointer AND the viewer identity (cache-first;
  // chat already holds this query). Always present (the panel is inside a committed chat), so single-element.
  const [chatQuery] = useSuspenseQueries({
    queries: [trpc.chat.getChat.queryOptions({ chatId })],
  });
  const chat = chatQuery.data;
  const isGame = chat.rpg !== null;

  // The two game reads fire ONLY when the pointer says this chat is a game (the dynamic-array idiom — an
  // empty array suspends on nothing, so a non-game chat never round-trips rpg).
  const gameQueries = useSuspenseQueries({
    queries: (isGame ? [chatId] : []).map((id) => trpc.rpg.getGame.queryOptions({ chatId: id })),
  });
  const trackerQueries = useSuspenseQueries({
    queries: (isGame ? [chatId] : []).map((id) => trpc.rpg.getTrackerView.queryOptions({ chatId: id })),
  });

  const gameQuery = gameQueries[0];
  const trackerQuery = trackerQueries[0];
  if (!isGame || gameQuery === undefined || trackerQuery === undefined) {
    return null;
  }
  const game = gameQuery.data;
  const isHost = chat.viewerIsHost === true;
  return {
    chatId,
    viewerUserId: chat.viewerUserId,
    isHost,
    game,
    tracker: trackerQuery.data,
    canEditShared: isHost && !game.trackersReadOnly,
  };
}
