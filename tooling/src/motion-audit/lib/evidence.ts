// ZERO HYGIENE (#409) — motion-audit's half of the fleet rule in _shared/evidence.ts (read that first):
// an audit whose evidence population is EMPTY has measured nothing, and `0%` / `PASS` over nothing is a
// smoothness claim nothing observed. Pure over the collected data — ops/ prints and maps to EXIT.toolError.
import { print, printResult } from "@orb/tooling/_shared/artifacts";
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import { INSTRUMENT_ERROR_VERDICT, printEvidenceGaps } from "@orb/tooling/_shared/evidence";
import type { AuditData } from "../contract/types.ts";

/** The app's in-page instrument is motion-audit's INPUT CONTRACT: `__orb` carries the LoAF ring, the CLS
 *  accumulator and the compositor-clean classification. A page without it answers every budget with a
 *  zero the probe never measured. */
export function orbBridgeGap(url: string): EvidenceGap {
  return {
    evidence: "the __orb dev bridge",
    detail: `${url} exposes no globalThis.__orb — the LoAF/CLS/animation evidence this audit judges does not exist on that page, so no verdict is possible`,
  };
}

/* WHY an empty frame population is a HARD instrument error and not a soft "the page was idle" note —
 * measured on this tree 2026-08-21 (#409), all headless, --no-throttle:
 *   · live app `/`, --window 2500 → 5 · 6 · 13 · 20 frames; --window 100 → 0 frames, 3 runs of 3.
 *   · a static fixture carrying a compositor-only animation → 18 frames in 300ms; the same page
 *     without the animation → 0, while the trace still delivered 57 events.
 * So an empty population does NOT prove the instrument broke — a short window over a quiesced surface
 * reaches it honestly, which is why the guard cannot be "the trace returned nothing". What it DOES
 * prove is that this run observed no frame at all, and `dropped/total` is undefined there. Both causes
 * share one verdict — the run is not a verdict — and the trace-event count separates them in the
 * message so the operator knows whether to widen --window or to fix the tracing. */
function framePopulationGap(data: AuditData, windowMs: number): EvidenceGap {
  return {
    evidence: "the frame population",
    detail:
      data.traceEventCount === 0
        ? `the CDP trace delivered NO events at all across the ${windowMs}ms measured window — tracing never ran; dropped-frame % is undefined, not 0%`
        : `the CDP trace delivered ${data.traceEventCount} events but 0 PipelineReporter frames across the ${windowMs}ms measured window — nothing composited, so dropped-frame % is undefined, not 0%; widen --window or measure a surface that moves`,
  };
}

/** Every input the PASS/FAIL verdict reads that this run did not actually observe. Empty ⇒ the numbers
 *  below are real and the budget arms may speak. RAW frames, never budgeted: an all-classified budgeted
 *  population is honestly empty (the exemption consumed it) and the raw evidence still exists. */
export function motionEvidenceGaps(data: AuditData, windowMs: number): EvidenceGap[] {
  const gaps: EvidenceGap[] = [];
  if (data.motion === null) {
    gaps.push({
      evidence: "the __orb motion snapshot",
      detail: "the in-page observers reported nothing (bridge present, snapshot absent) — the LoAF and CLS budgets have no evidence to judge",
    });
  }
  if (data.frames.raw.total === 0) {
    gaps.push(framePopulationGap(data, windowMs));
  }
  return gaps;
}

/** The fail-fast arm: print the gap + a machine line and hand the caller EXIT.toolError's payload. Used
 *  where the audit stops BEFORE it has an AuditData to report (the missing bridge, pre-trace). */
export function reportInstrumentError(url: string, gap: EvidenceGap): void {
  print(`URL         ${url}`);
  printEvidenceGaps([gap]);
  printResult("motion-audit", [
    ["verdict", INSTRUMENT_ERROR_VERDICT],
    ["absent-evidence", gap.evidence],
  ]);
}
