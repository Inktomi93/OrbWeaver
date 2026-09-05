// domain/rpg/contract/trace — the RPG flight-recorder SHAPES (R-OBS; the D55 `memoryTrace` precedent). ONE
// type home: a per-turn structured event STREAM emitted through an injected {@link RpgTraceSink}, ring-buffered
// by the compose-built recorder (`../trace.ts`), read host-only at `/api/_debug/rpg/traces`.
//
// The staging accumulator's individual ops are NOT traced — today's flush is one `writeFlush` with its own
// contract-invalid backstop, so a per-op stream would trace a shape that no longer decides anything. Instead a
// `flush` phase carries the R1 delivery fork (`path`/`fallbackReason`) — the single most diagnostic rpg fact on
// this tree: a `folded` game silently falling back to the post-commit round is correct-but-expensive, and
// invisible without this. It is raised at DISPATCH; the `flushed` phase beside it is the WRITE BOUNDARY's own
// settle event (#1493) and is the only one of the two a barrier may poll. `tool` carries the args VERBATIM plus the DROP/SALVAGE verdict, because the failure
// class this recorder exists for is precisely "the model sent something the schema refused" — a trace that only
// recorded successes would be blind to it.
//
// OPT-IN + ZERO-COST WHEN OFF: the sink is `undefined` unless tracing is enabled, and every emit site guards
// with `trace?.(buildEvent())` — an optional CALL short-circuits its ARGUMENT, so the event object is never
// CONSTRUCTED when off. The turn is byte-identical either way: the sink is a pure side effect that never feeds
// back into turn logic.
//
// CORRELATION: the turn path has no single key spanning it, so this is a STREAM, not one correlated object.
// Every event carries `chatId`; the ones raised INSIDE a resolved turn also carry its `ChatTurnId`. The
// recorder filters on either, and a consumer joins a turn's events by `turnId` and a chat's by `chatId` — the
// two query keys the `/api/_debug/rpg/traces` route already exposes.

import type { RpgBusEventType, RpgDeliveryPath, RpgFoldFallbackReason, RpgRecordedToolCall } from "@orb/contracts/rpg";
import type { ChatId, ChatTurnId } from "@orb/kit/ids";

/** The per-turn RPG trace event. Discriminated on `phase`; the recorder stamps `seq`/`at` at record time (the
 *  emitter never reads a clock — determinism). */
export type RpgTraceEvent =
  | {
      /** What the turn MOUNTED: the terminal tools attached to the character turn (R1 folded mode). The
       *  server-side twin of the prompt-debug panel — "what was this turn even able to write". */
      readonly phase: "mount";
      readonly chatId: ChatId;
      readonly toolNames: readonly string[];
    }
  | {
      /** What the model CALLED, and what survived the schema. */
      readonly phase: "tool";
      readonly chatId: ChatId;
      readonly turnId: ChatTurnId;
      readonly calls: readonly RpgRecordedToolCall[];
      /** The vehicle that carried them — `folded extraction` / `tool round` / `structured extraction` (the
       *  compose logger's own `vehicle` vocabulary, passed through as a string so the recorder never becomes a
       *  second home for it). */
      readonly vehicle: string;
    }
  | {
      /** WHICH DELIVERY PATH THE ROUND RESOLVED TO (R1) — emitted at DISPATCH, when `resolveStateRound`
       *  picks the vehicle, and therefore BEFORE the round runs and long before anything is written.
       *  It is a fork receipt, NEVER a settle barrier: a reader waiting for "the extraction finished"
       *  wants `flushed` below (#1493 fix-back — this event's name misled exactly that reader once). */
      readonly phase: "flush";
      readonly chatId: ChatId;
      readonly turnId: ChatTurnId;
      readonly path: RpgDeliveryPath;
      readonly fallbackReason: RpgFoldFallbackReason | null;
    }
  | {
      /** THE WRITE BOUNDARY SETTLED (#1493). Emitted after `writeFlush` returns — after the durable
       *  snapshot+journal commit, after the hand-row fold, after the tool-call record — on EVERY arm of the
       *  round: a flush that wrote, a flush the contract backstop REFUSED, a round that staged nothing at
       *  all, and a round whose write boundary THREW. This is the one event that is false before the
       *  extraction has run and true after it, which is what a settle barrier needs.
       *
       *  `wrote` is the durable half (a snapshot landed); `droppedReason` names the write-contract field
       *  that refused when the F1 backstop dropped the flush, and is `null` on every other arm. Together
       *  they answer "did anything land, and if not, why" without a second query. */
      readonly phase: "flushed";
      readonly chatId: ChatId;
      readonly turnId: ChatTurnId;
      readonly wrote: boolean;
      readonly droppedReason: string | null;
    }
  | {
      /** What the turn ANNOUNCED to the live panel. */
      readonly phase: "bus";
      readonly chatId: ChatId;
      readonly type: RpgBusEventType;
    };

/** The injected trace sink (the `memoryTrace` / `ChatContext.log` precedent). `undefined` when the recorder is
 *  not wired — emit sites guard with `?.`, so OFF is zero-cost and byte-identical. Synchronous +
 *  side-effect-only; it must never throw into the turn path. */
export type RpgTraceSink = (event: RpgTraceEvent) => void;

/** A recorded event, stamped with its monotonic sequence + wall-clock time (the emitter supplies neither —
 *  determinism). The ring shape the recorder buffers and the debug read tails. */
export interface RpgTraceRecord {
  readonly seq: number;
  readonly at: number;
  readonly event: RpgTraceEvent;
}

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
