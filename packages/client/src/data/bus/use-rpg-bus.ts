// The feature-root rpg bus transport adapter — twin of use-user-bus.ts, scoped to ONE open game's `chatId`.
// Subscribes `rpg.stream` (a LIVE-only per-game SSE relay, no durable log / no cursor) and forwards every
// event into invalidation.invalidateRpg (data/invalidation.ts → RPG_BUS_FILTERS). Live-only, self-healing:
// on every (re)connect the hook gap-heals with a blanket invalidate over the game's reads (a missed tick
// during downtime needs closing — the user-bus posture). `null` detaches (a non-game chat has no stream).
//
// Mount ONCE at the authed composition root (routes/app-root.tsx), keyed to the active chat — never in a
// feature, which could unmount and drop the freshness driver mid-game (the useUserBus rule).
//
// A NON-GAME CHAT HOLDS NO SOCKET (the hook's own "`null` detaches" law, enforced here since 2026-07-31):
// the gate is the chat's game POINTER off the already-warm `chat.getChat` — no new read. This is a real
// budget constraint, not tidiness: a browser allows ~6 concurrent connections per origin, every SSE
// subscription pins one for its lifetime, and a room already holds two (user bus + chat bus). A third
// idle-by-construction stream per chat put a SECOND tab over the cap, at which point every further request
// on that origin queues forever (measured: the two-tab in-room e2e specs starved from the moment this hook
// landed). Nothing is lost by gating: `gameChanged` only invalidates `rpg.getGame`/`rpg.getConfigView`,
// both of which are themselves pointer-gated and unmounted on a chat with no game.

import type { RpgBusEvent } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { skipToken } from "@tanstack/react-query";
import { useSubscription } from "@trpc/tanstack-react-query";
import { useTRPC } from "../trpc";
import { useGatedQuery } from "../use-gated-query";

/** What the hook needs from the central invalidation seam (`data/invalidation.ts`) — the rpg-bus entry point
 *  + the (re)connect gap-heal. Passed from `app-root.tsx` (the seam is rebuilt per render; identity churn is
 *  harmless — the subscription keys off `chatId`, which does change on chat switch). */
export interface RpgBusDeps {
  /** Route ONE live `RpgBusEvent` through the exhaustive `RPG_BUS_FILTERS` map. */
  readonly invalidateRpg: (event: RpgBusEvent) => void;
  /** The (re)connect gap-heal — re-resolve the whole game panel for `chatId`. */
  readonly gapHealRpg: (chatId: ChatId) => void;
}

/**
 * Attach the per-game live event stream and drive the invalidation seam from it. `null` detaches (no game).
 * `onData` routes each event; `onConnectionStateChange` fires the gap-heal on every transition INTO the live
 * (`pending`) state — which covers BOTH the first connect and every reconnect after an SSE drop.
 */
export function useRpgBus(chatId: ChatId | null, deps: RpgBusDeps): void {
  const trpc = useTRPC();
  // The pointer read rides the room's own warm `chat.getChat` cache (TanStack dedupes it with the header /
  // options-menu readers) — a game that is BORN while this chat is open re-renders here as soon as that read
  // refetches, and the stream attaches then.
  const chatQuery = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const isGame = (chatQuery.data?.rpg ?? null) !== null;
  useSubscription(
    trpc.rpg.stream.subscriptionOptions(chatId === null || !isGame ? skipToken : { chatId }, {
      onData: (event) => {
        deps.invalidateRpg(event);
      },
      onConnectionStateChange: (connection) => {
        // `pending` = the stream is live; heal on every arrival (first connect AND reconnect).
        if (connection.state === "pending" && chatId !== null) {
          deps.gapHealRpg(chatId);
        }
      },
    }),
  );
}
