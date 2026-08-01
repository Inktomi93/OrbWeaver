// The feature-root rpg bus transport adapter — twin of use-user-bus.ts, scoped to ONE open game's `chatId`.
// Joins the `rpg` ROOM on the tab's ONE socket (SSE-1) and forwards every event into invalidation.invalidateRpg
// (data/invalidation.ts → RPG_BUS_FILTERS). Live-only, self-healing: on every (re)connect the hook gap-heals
// with a blanket invalidate over the game's reads (a missed tick during downtime needs closing — the
// user-bus posture). `null` detaches (a non-game chat has no room).
//
// Mount ONCE at the authed composition root (routes/app-root.tsx), keyed to the active chat — never in a
// feature, which could unmount and drop the freshness driver mid-game (the useUserBus rule).
//
// THE GAME GATE RIDES `isRpgEngaged`, NEVER A RE-SPELLED NULL-CHECK. This hook shipped with
// `(chatQuery.data?.rpg ?? null) !== null` — exactly the re-spell `contracts/rpg/pointer.ts` names and bans
// ("Every client gate reads THIS, never a re-spelled null-check — the OFF arm must gate identically
// everywhere"). The consequence was a real leak of the class the header CLAIMED to have closed: a chat whose
// game is DISENGAGED (#40 front-door toggle OFF — panel hidden, turn assembly clean, nothing rendered) still
// opened a full always-on `rpg.stream` connection, because its pointer is present-but-`engaged:false`. Every
// other consumer of that pointer (the takeover door, the context tabs, the wand, the reading surface) went
// through the predicate; this one did not, so nothing else in the app agreed with it.
//
// What the gate is FOR now: under one socket per tab it saves an ATTACH ROUND-TRIP, not a connection — the
// starvation class it was standing in front of no longer exists (a browser allows ~6 connections per origin,
// and this hook's third always-on stream is what put a second tab over the ceiling on 2026-08-01). It is kept
// because it is honest: `gameChanged` only invalidates `rpg.getGame`/`rpg.getConfigView`, both of which are
// themselves pointer-gated and unmounted when the game is off.
//
// The gate is deliberately POINTER-shaped, not game-truth-shaped: it reads `chat.getChat.rpg` off the
// already-warm room read (no new query), so a game BORN or RE-ENGAGED while this chat is open attaches as
// soon as that read refetches. Its known imprecision is a DANGLING pointer (a chat whose `metadata.rpg`
// outlived its game — the condition `rpg.detachDanglingPointer` exists to heal): that chat attaches a room
// that never delivers. Under the multiplex that costs one idle map entry, which is why the pointer read
// stays the gate rather than growing a second authoritative read to prove game-ness.
//
// A room-level server fault arrives as a `roomFailed` frame carrying the classified code + message, routed
// to the notify seam (never into `invalidateRpg`); the room detaches and the socket survives.

import type { RpgBusEvent } from "@orb/contracts/rpg";
import { isRpgEngaged } from "@orb/contracts/rpg";
import type { StreamRoomRef } from "@orb/contracts/stream";
import type { ChatId } from "@orb/kit/ids";
import { notify } from "#lib";
import { useTRPC } from "../trpc";
import { useGatedQuery } from "../use-gated-query";
import { useBusRoom } from "./use-bus-room";

/** What the hook needs from the central invalidation seam (`data/invalidation.ts`) — the rpg-bus entry point
 *  + the (re)connect gap-heal. Passed from `app-root.tsx` (the seam is rebuilt per render; identity churn is
 *  harmless — the room keys off `chatId`, which does change on chat switch). */
export interface RpgBusDeps {
  /** Route ONE live `RpgBusEvent` through the exhaustive `RPG_BUS_FILTERS` map. */
  readonly invalidateRpg: (event: RpgBusEvent) => void;
  /** The (re)connect gap-heal — re-resolve the whole game panel for `chatId`. */
  readonly gapHealRpg: (chatId: ChatId) => void;
}

/**
 * Attach the per-game live event room and drive the invalidation seam from it. `null` detaches (no game).
 * `onEvent` routes each event; `onSocketLive` fires the gap-heal on every transition INTO the live state —
 * which covers BOTH the first connect and every reconnect after an SSE drop.
 */
export function useRpgBus(chatId: ChatId | null, deps: RpgBusDeps): void {
  const trpc = useTRPC();
  // The pointer read rides the room's own warm `chat.getChat` cache (TanStack dedupes it with the header /
  // options-menu readers) — a game that is BORN while this chat is open re-renders here as soon as that read
  // refetches, and the room attaches then.
  const chatQuery = useGatedQuery(chatId, (id) => trpc.chat.getChat.queryOptions({ chatId: id }));
  const isGame = isRpgEngaged(chatQuery.data?.rpg ?? null);
  const ref: Extract<StreamRoomRef, { channel: "rpg" }> | null = chatId === null || !isGame ? null : { channel: "rpg", chatId };
  useBusRoom<"rpg">(ref, {
    onEvent: (frame) => {
      deps.invalidateRpg(frame.event);
    },
    onSocketLive: () => {
      if (chatId !== null) {
        deps.gapHealRpg(chatId);
      }
    },
    onError: (message) => {
      notify.error(message);
    },
  });
}
