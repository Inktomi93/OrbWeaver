// ZERO HYGIENE (#409) — render-trace's half of the fleet rule in _shared/evidence.ts (read that first).
//
// Two zeros live in this tool and they are NOT the same shape:
//   · a trace with no spans / a fire run whose requests produced no trace → the tracer recorded
//     nothing, so there is no evidence and the run is not a verdict (EXIT.toolError);
//   · an empty TRACES LIST → a healthy endpoint with nothing recorded yet, which is a real answer.
//     That one stays clean and is SAID out loud instead (ops/render.ts).
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";

export function emptySpansGap(requestId: string): EvidenceGap {
  return {
    evidence: "the span population",
    detail: `trace ${requestId} carries 0 spans — a recorded trace always holds at least its root span, so this one captured nothing; the header alone is not a waterfall`,
  };
}

/** The fire op's own outcome, reduced to the question "did this run produce evidence?".
 *
 *  UNWIRED is the interesting arm and it CONTRADICTS a ruling recorded in ops/fire.ts's own text
 *  ("reported loudly, still exit 0 (a missing capability is a skip, not a request failure)"). The
 *  ruling survives — its INPUT changed: that comment's own next sentence records that `initTracing()`
 *  IS wired at entry/lifecycle.ts, which makes this arm a LIVE REGRESSION TRIPWIRE rather than a
 *  known-missing capability. A tripwire that exits 0 is not a tripwire. The loud message and the
 *  `traces=UNWIRED` token are preserved verbatim; only the exit changes. */
export function fireEvidenceGap(batch: {
  readonly fired: number;
  readonly missingRid: number;
  readonly rendered: number;
  /** Requests that DID carry a request id but whose `/api/_debug/traces/<rid>` fetch did not answer with a
   *  trace. REQUIRED since #1507 — the caller has always counted these (it writes a "no trace recorded for
   *  rid=…" line per miss) and then dropped the number on the floor. */
  readonly detailFailed: number;
}): EvidenceGap | null {
  if (batch.fired === 0) {
    return null;
  }
  if (batch.missingRid === batch.fired) {
    return {
      evidence: "the observability middleware",
      detail:
        "no response carried X-Request-Id: the middleware is NOT mounted at entry/ (initTracing is expected wired at entry/lifecycle.ts) — every request in this run is untraceable, so the run observed nothing",
    };
  }
  if (batch.rendered === 0) {
    return {
      evidence: "the trace ring",
      detail: `${batch.fired} request(s) carried a request id but the debug API returned no trace for any of them — the requests happened and the recording did not, so there is nothing to render`,
    };
  }
  // PARTIAL is a gap too (#1507). The op only asked "did ANY trace render?", so a run where 1 of 3 traced
  // requests came back rendered a waterfall, printed `traces=1`, and exited clean — the two missing
  // recordings visible nowhere but a stderr line nobody parses. The whole point of firing N requests is
  // the N traces; a subset is incomplete evidence, and this tool's own zero-hygiene rule (header, #409)
  // says incomplete recording is a tool error, not a verdict about the app.
  if (batch.detailFailed > 0) {
    const traced = batch.fired - batch.missingRid;
    return {
      evidence: "the trace ring",
      detail: `${batch.detailFailed} of ${traced} request(s) that carried a request id have NO trace in the ring (rendered ${batch.rendered}) — this run's evidence is partial, so its waterfalls describe only the requests that happened to be recorded`,
    };
  }
  return null;
}
