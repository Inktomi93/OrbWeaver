// domain/rpg/contract/trace — the RPG flight-recorder SHAPES (R-OBS; the D55 `memoryTrace` precedent). ONE
// type home: a per-turn structured event STREAM emitted through an injected {@link RpgTraceSink}, ring-buffered
// by the compose-built recorder (`../trace.ts`), read host-only at `/api/_debug/rpg/traces`.
//
// PORTED from `legacy-main:packages/server/src/domain/rpg/contract/trace.ts` (43d5169fd, R-OBS) and RE-CUT to
// today's tree, which is not the tree that file was written for. What changed and WHY:
//   • The legacy `staging` / `domain-event` phases are GONE. The staging accumulator's ops are no longer the
//     interesting boundary — today's flush is one `writeFlush` with its own contract-invalid backstop, and the
//     legacy per-op stream would trace a shape that no longer decides anything.
//   • A `flush` phase REPLACES them, carrying the R1 delivery fork (`path`/`fallbackReason`) that did not exist
//     when the original was written. It is the single most diagnostic rpg fact on today's tree: a `folded` game
//     silently falling back to the post-commit round is correct-but-expensive, and invisible without this.
//   • `tool` carries the args VERBATIM and adds the DROP/SALVAGE verdict, because the live failure class this
//     recorder was re-lit for (`SCENE-DROPPED`/`TOOLDROP-BLIND`, `dogfood-tracking.md`) is precisely "the model
//     sent something the schema refused" — a trace that only recorded successes would have been blind to all 12.
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

import type { RpgBusEventType, RpgDeliveryPath, RpgFoldFallbackReason } from "@orb/contracts/rpg";
import type { ChatId, ChatTurnId } from "@orb/kit/ids";

/** One tool call the model co-emitted, as the recorder sees it — the NAME, the args VERBATIM (opaque: the
 *  shapes are heterogeneous per tool and the malformed ones are the point, so they are captured before any
 *  parse), and what the extraction fold DID with it. */
export interface RpgTraceToolCall {
  readonly name: string;
  /** The raw arguments the model sent. A string when the model emitted unparseable JSON — the exact case a
   *  parsed-only capture would erase. */
  readonly args: unknown;
  /** `applied` — parsed clean · `salvaged` — an invalid field was dropped and the remainder applied (EXT-4a) ·
   *  `dropped` — the call did not parse at all and wrote nothing. */
  readonly verdict: "applied" | "salvaged" | "dropped";
  /** WHICH fields lost, for the two non-clean verdicts: the salvaged field paths, or the parse issue. Empty on
   *  `applied`. */
  readonly issues: readonly string[];
}

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
      readonly calls: readonly RpgTraceToolCall[];
      /** The vehicle that carried them — `folded extraction` / `tool round` / `structured extraction` (the
       *  compose logger's own `vehicle` vocabulary, passed through as a string so the recorder never becomes a
       *  second home for it). */
      readonly vehicle: string;
    }
  | {
      /** What the flush WROTE, and by which delivery path (R1). */
      readonly phase: "flush";
      readonly chatId: ChatId;
      readonly turnId: ChatTurnId;
      readonly path: RpgDeliveryPath;
      readonly fallbackReason: RpgFoldFallbackReason | null;
      /** Present only when the write-boundary backstop REFUSED the flush — the state was contract-invalid and
       *  nothing landed. Absent ⇒ the flush wrote. */
      readonly droppedReason?: string;
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
