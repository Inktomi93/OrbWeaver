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

/** HOW A STATE ROUND ENDED — one importable union, the settle event's and the settle hook's shared
 *  vocabulary (§5.5: never re-spelled at either site). The members are the arms of `flushTurn`:
 *  • `wrote` — the snapshot (and any journal) committed;
 *  • `no-writes` — the round ran and staged nothing (the quiet beat; the 8B model's commonest end);
 *  • `dropped` — the F1 write-boundary backstop refused a contract-invalid state (`droppedReason` says which
 *    field), so canon is untouched;
 *  • `cancelled` — the caller pressed Stop, at either gate; whatever was staged was discarded;
 *  • `readonly` — the F2 gate: this game's resolved connection has no write path, so NO round ran at all;
 *  • `failed` — something threw out of the round, the write boundary, or the tool-call disclosure. The
 *    settle still fires (from the `finally`) BEFORE the throw propagates, because a barrier that only
 *    releases on success hangs to its timeout on exactly the turn a reader most needs to see. */
export type RpgFlushOutcome = "wrote" | "no-writes" | "dropped" | "cancelled" | "readonly" | "failed";

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
      /** THE STATE ROUND SETTLED (#1493). Emitted from the OUTERMOST `finally` of `flushTurn`, so it is
       *  TOTAL over every arm — the write that landed, the backstop's refusal, the quiet beat that staged
       *  nothing, both cancel gates, the F2 readonly game that ran no round at all, and any throw out of
       *  the round or the disclosure write. This is the one event that is false before the extraction has
       *  run and true after it, which is what a settle barrier needs.
       *
       *  TOTALITY IS THE WHOLE POINT and it was NOT true of the first cut (verifier v-L2-tooling): the
       *  settle sat in the write boundary's own `finally`, AFTER `recordTurnCalls`, so a failed disclosure
       *  write, a throw out of `stageStateRound`, either cancel arm and the readonly return all skipped it
       *  — and a barrier polling for it hung to its timeout instead of releasing.
       *
       *  `outcome` names WHICH arm; `droppedReason` names the write-contract field the F1 backstop refused
       *  and is `null` on every arm but `dropped`. */
      readonly phase: "flushed";
      readonly chatId: ChatId;
      readonly turnId: ChatTurnId;
      readonly outcome: RpgFlushOutcome;
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
