// domain/rpg/contract/trace — the RPG flight-recorder's domain ports: the injected {@link RpgTraceSink}, the read
// filter and the compose-built recorder. The event and record SHAPES are wire shapes (`/api/_debug/rpg/traces`),
// homed in `@orb/contracts/rpg`. The recorder stamps `seq`/`at`; emitters never read a clock.
//
// OPT-IN + ZERO-COST WHEN OFF: the sink is `undefined` unless tracing is enabled, and every emit site guards
// with `trace?.(buildEvent())`, so the event object is never constructed when off. The sink is a pure side effect
// that never feeds back into turn logic. Events carry `chatId`, and those raised inside a resolved turn also
// `turnId`; the recorder filters on either.

import type { RpgTraceEvent, RpgTraceRecord } from "@orb/contracts/rpg";
import type { ChatId, ChatTurnId } from "@orb/kit/ids";

/** The injected trace sink (the `memoryTrace` / `ChatContext.log` precedent). `undefined` when the recorder is
 *  not wired — emit sites guard with `?.`, so OFF is zero-cost and byte-identical. Synchronous +
 *  side-effect-only; it must never throw into the turn path. */
export type RpgTraceSink = (event: RpgTraceEvent) => void;

/** The read filter: narrow to one chat's events, one committed turn's events, or the most-recent N. An event
 *  lacking the filtered key (a `mount`/`bus` event has no `turnId` — the mount runs before the turn resolves
 *  one, and a bus emit is a chat-scoped announcement) is EXCLUDED when that key is filtered on. */
export interface RpgTraceFilter {
  readonly chatId?: ChatId;
  readonly turnId?: ChatTurnId;
  readonly limit?: number;
}

/** The compose singleton (`../trace.ts` builds ONE when tracing is enabled): the injected {@link RpgTraceSink}
 *  plus the host-only ring read. */
export interface RpgTraceRecorder {
  readonly sink: RpgTraceSink;
  /** The matching records in chronological order, capped to the most-recent `limit` (default: the ring depth). */
  readonly recent: (filter?: RpgTraceFilter) => readonly RpgTraceRecord[];
}
