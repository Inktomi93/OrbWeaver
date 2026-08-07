// domain/rpg/trace — the RPG flight-recorder RUNTIME (R-OBS; the D55 `memoryTrace` precedent). A
// compose-created singleton (the `staging.ts` posture, NOT the module singleton `bus.ts` is): a bounded
// in-memory ring of the per-turn {@link RpgTraceEvent} stream, with the injected {@link RpgTraceSink} that
// records into it and the host-only read (`recent`) the `/api/_debug/rpg/traces` route tails.
//
// NO PERSISTENT TABLE — per-turn ephemera (D75: the debug surface is read-only introspection); the ring drops
// the oldest record past `limit`. OPT-IN: the composition root builds ONE only when tracing is enabled (env
// `RPG_TRACE=on`, or the `rpgTrace` compose dep an int test / the drive kit forces) and wires its `sink`
// through the rpg compose deps; unwired, the sink is `undefined` and every emit site is zero-cost.
//
// ASSUMES(single-replica): the ring is per-process (the `bus.ts` precedent). The recorder stamps each record's
// `seq` (a monotonic counter) + `at` (via the injected `now`), so the emitters stay clock-free.
//
// PORTED from `legacy-main:packages/server/src/domain/rpg/trace.ts` (43d5169fd) — the ring itself is the
// original's; the filter keys follow this tree's re-cut event union (`contract/trace.ts` header).

import type { ChatId, ChatTurnId } from "@orb/kit/ids";
import type { RpgTraceEvent, RpgTraceFilter, RpgTraceRecord, RpgTraceRecorder } from "./contract/trace.ts";

/** The default ring depth — a few turns' worth of a chatty tool loop; the oldest record drops past it. */
const DEFAULT_LIMIT = 2000;

/** Does this event carry `chatId === wanted`? (every member does today — kept as a guard so a future
 *  chat-less member cannot silently match a chat filter). */
function matchesChat(event: RpgTraceEvent, wanted: ChatId): boolean {
  return "chatId" in event && event.chatId === wanted;
}

/** Does this event carry `turnId === wanted`? A `mount`/`bus` event has none (the mount runs before the turn
 *  resolves one; a bus emit is a chat-scoped announcement), so neither ever matches a turn filter. */
function matchesTurn(event: RpgTraceEvent, wanted: ChatTurnId): boolean {
  return "turnId" in event && event.turnId === wanted;
}

/** Build the per-process trace recorder (ONE, wired at the composition root when tracing is enabled). */
export function createRpgTraceRecorder(deps: { readonly now: () => number; readonly limit?: number }): RpgTraceRecorder {
  const limit = deps.limit ?? DEFAULT_LIMIT;
  const ring: RpgTraceRecord[] = [];
  let seq = 0;

  return {
    sink: (event: RpgTraceEvent): void => {
      seq += 1;
      ring.push({ seq, at: deps.now(), event });
      if (ring.length > limit) {
        ring.shift();
      }
    },
    recent: (filter?: RpgTraceFilter): readonly RpgTraceRecord[] => {
      const matched = ring.filter((record) => {
        if (filter?.chatId !== undefined && !matchesChat(record.event, filter.chatId)) {
          return false;
        }
        if (filter?.turnId !== undefined && !matchesTurn(record.event, filter.turnId)) {
          return false;
        }
        return true;
      });
      const cap = filter?.limit ?? limit;
      return cap >= matched.length ? matched : matched.slice(matched.length - cap);
    },
  };
}
