// `useBusRoom` — THE room hook (SSE-1 §6). Every feature-facing bus hook (`useUserBus`, `useRpgBus`, and
// `useChatBus`/`useInboxStream` as they fold) is a thin body over this; their SIGNATURES and semantics are
// unchanged, so no feature file knows the multiplex exists.
//
// `null` DETACHES — and detaching is now genuinely free. Under one-subscription-per-hook, a "don't attach"
// gate was load-bearing budget discipline (the 2026-08-01 incident: a third always-on stream per room put a
// second tab over the browser's ~6-per-origin ceiling). Here it saves an attach round-trip instead of a
// connection, so the gate stays honest without being the thing standing between the app and starvation.
//
// THE EFFECT KEYS ON THE ROOM KEY STRING, NOT THE REF OBJECT. Callers build their ref inline
// (`{ channel: "rpg", chatId }`), which is a fresh object every render; depping on it would re-attach —
// and re-fire the gap-heal — on every unrelated re-render. The latest ref + handlers live in one ref-box
// updated in an effect (never during render — `react-hooks/refs`), so the join effect re-runs ONLY when the
// room actually changes, while the handlers it calls are always the current render's.

import type { StreamChannel, StreamFrameFor, StreamRoomRef } from "@orb/contracts/stream";
import { roomKey } from "@orb/contracts/stream";
import { useEffect, useRef } from "react";
import type { SinceSeqSource } from "./room-registry.ts";
import { roomRegistry } from "./room-registry.ts";

/** What a room's consumer wants, narrowed to that channel's own frame arm. */
export interface BusRoomHandlers<C extends StreamChannel> {
  readonly onEvent: (frame: StreamFrameFor<C>) => void;
  /** Every transition into a LIVE socket (first connect AND reconnect) and on a `roomLagged` — the ONE
   *  gap-heal edge each hook already had, now fanned out from the socket. */
  readonly onSocketLive?: (() => void) | undefined;
  /** The room's typed failure — the surface each hook's `__subscriptionError` route had. */
  readonly onError?: ((message: string) => void) | undefined;
  /** A durable room's replay request (`0` = from the beginning). Live-only rooms omit it. Pass a THUNK for
   *  a value that must be current at every (re)announce — a reconnect's replay request, e.g. */
  readonly sinceSeq?: SinceSeqSource | undefined;
}

/** Attach one room to the tab's socket for as long as this component is mounted and `ref` is non-null. */
export function useBusRoom<C extends StreamChannel>(ref: Extract<StreamRoomRef, { channel: C }> | null, handlers: BusRoomHandlers<C>): void {
  const key = ref === null ? null : roomKey(ref);
  const latest = useRef({ ref, handlers });

  // Runs on EVERY render (no dep array) and BEFORE the join effect below (effects fire in declaration
  // order), so the join always reads the current render's ref + handlers.
  useEffect(() => {
    latest.current = { ref, handlers };
  });

  useEffect(() => {
    const joined = latest.current.ref;
    if (key === null || joined === null) {
      return;
    }
    return roomRegistry.join(joined, {
      onEvent: (frame) => {
        // The registry routes by roomKey, so a frame reaching this room IS this channel's arm.
        latest.current.handlers.onEvent(frame as StreamFrameFor<C>);
      },
      onSocketLive: () => latest.current.handlers.onSocketLive?.(),
      onError: (message) => latest.current.handlers.onError?.(message),
      // A THUNK over the CURRENT render's handler, so a reconnect re-announce reads today's replay request
      // (the client's high-water mark), never the one this room happened to join with.
      sinceSeq: (): number | null => {
        const wanted = latest.current.handlers.sinceSeq;
        return typeof wanted === "function" ? wanted() : (wanted ?? null);
      },
    });
  }, [key]);
}
