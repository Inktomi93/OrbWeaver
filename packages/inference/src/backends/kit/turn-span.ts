// THE TURN'S SPAN EVENTS (audit D4). Before this module `addSpanEvent` fired for retries and the catalog
// cache and for NOTHING on the turn path, so a trace of a chat turn was one long undifferentiated span: the
// question "did this turn spend its time waiting for the first token or generating the rest" had no answer
// on the timeline, and neither did "why did it stop" or "did the prompt cache actually hit".
//
// THREE EVENTS, chosen because each answers a question the SPAN'S OWN DURATION cannot:
//   • `provider.first_delta` — the TTFT boundary. Everything before it is queue + prefill + network;
//     everything after is generation. One timestamp splits a slow turn into the two very different causes.
//   • `provider.finish` — the normalized stop reason + the raw upstream word beside it. A `length` finish
//     and a `stop` finish are the same shape of span and completely different outcomes.
//   • `provider.cache` — the hit ratio and the breakpoints that produced it. A cache write is only visible
//     as cost; a cache HIT is only visible here.
//
// ATTRIBUTES ARE SCALARS ONLY (`AddSpanEvent`'s own type), and never content: a span attribute is an
// operator surface with a different retention and a different audience than the wire-capture ring, and the
// D19/D16 payload rules that keep prompt bytes off the bus apply to it for the same reason.

import type { ChatResult } from "../../contract/chat.ts";
import type { AddSpanEvent } from "../../contract/runtime.ts";

/** One turn's cache placement, as the two hosted wires already count it for their own receipts. */
export interface TurnCacheSpan {
  readonly breakpointsPlaced: number;
  readonly readTokens: number;
  readonly writeTokens: number;
}

/** Emit the turn's timeline events. Absent `addSpanEvent` ⇒ nothing happens (no span in scope), which is the
 *  same posture every other consumer of the dep takes. `firstDeltaAt` is absent on a turn that streamed no
 *  delta at all (an empty completion, or a failure before the first token). */
export function emitTurnSpanEvents(args: {
  readonly addSpanEvent?: AddSpanEvent | undefined;
  readonly turnId: string;
  readonly model: string;
  readonly startedAt: number;
  readonly firstDeltaAt: number | undefined;
  readonly turn: ChatResult;
  readonly cache: TurnCacheSpan;
}): void {
  const { addSpanEvent, turn } = args;
  if (addSpanEvent === undefined) {
    return;
  }
  if (args.firstDeltaAt !== undefined) {
    addSpanEvent("provider.first_delta", { turnId: args.turnId, model: args.model, ttftMs: args.firstDeltaAt - args.startedAt });
  }
  addSpanEvent("provider.finish", {
    turnId: args.turnId,
    model: args.model,
    // The NORMALIZED member is what anything may branch on; the raw word rides beside it as opaque
    // provenance (§5.3c class 4) so an `other` can be debugged without a second read.
    finishReason: turn.finishReason ?? "unknown",
    stopReason: turn.stopReason ?? "",
    toolCalls: turn.toolCalls?.length ?? 0,
  });
  const total = args.cache.readTokens + args.cache.writeTokens;
  // Emitted even at zero: "the breakpoints were placed and NOTHING hit" is the finding worth having, and an
  // absent event reads identically to a turn that never tried to cache.
  addSpanEvent("provider.cache", {
    turnId: args.turnId,
    breakpointsPlaced: args.cache.breakpointsPlaced,
    readTokens: args.cache.readTokens,
    writeTokens: args.cache.writeTokens,
    hitRatio: total > 0 ? args.cache.readTokens / total : 0,
  });
}
