// ZERO HYGIENE (#409) — motion-audit's half of the fleet rule in _shared/evidence.ts (read that first):
// an audit whose evidence population is EMPTY has measured nothing, and `0%` / `PASS` over nothing is a
// smoothness claim nothing observed. Pure over the collected data — ops/ prints and maps to EXIT.toolError.
import { print } from "@orb/tooling/_shared/artifacts";
import type { EvidenceGap } from "@orb/tooling/_shared/evidence";
import { INSTRUMENT_ERROR_VERDICT, printEvidenceGaps, printVerdict } from "@orb/tooling/_shared/evidence";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { AuditData } from "../contract/types.ts";
import { clsBudgeted } from "./verdicts.ts";

/** The app's in-page instrument is motion-audit's INPUT CONTRACT: `__orb` carries the LoAF ring, the CLS
 *  accumulator and the compositor-clean classification. A page without it answers every budget with a
 *  zero the probe never measured. */
export function orbBridgeGap(url: string): EvidenceGap {
  return {
    evidence: "the __orb dev bridge",
    detail: `${url} signalled data-app-ready and STILL exposes no globalThis.__orb — the LoAF/CLS/animation evidence this audit judges does not exist on that page, so no verdict is possible`,
  };
}

/** The app never signalled readiness. DISTINCT FROM A MISSING BRIDGE, and the distinction is the whole
 *  point (#515): motion-audit printed "the __orb dev bridge is ABSENT" against a page that exposes all 21
 *  bridge keys — snap read them on the same URL seconds later. The real cause was a cold-vite boot
 *  (1141 requests) blowing the readiness ceiling, and the bridge simply had not been installed YET. A
 *  wrong diagnosis printed with confidence is worse than no diagnosis: the next lane reads "no bridge" as
 *  a broken app and goes hunting in the client. */
export function appReadyTimeoutGap(url: string, timeoutMs: number): EvidenceGap {
  return {
    evidence: "app readiness (data-app-ready)",
    detail: `${url} never signalled data-app-ready within ${timeoutMs}ms — the app had not finished booting, so nothing about it was measured AND the __orb bridge could not be checked at all (an absent bridge at this point is a boot symptom, not a finding). RETRYABLE and usually environmental: a cold vite compiling the route on first navigation is the standard cause — re-run against the now-warm stack`,
  };
}

/** THE APPARATUS VERDICT, decided once from the two facts a run can observe, in the ONE order that makes
 *  each claim honest: readiness first, because "no bridge" is only a claim about the APP once the app has
 *  had its chance to install one. `null` ⇒ the apparatus is present and the audit may speak. */
export function apparatusGap(input: {
  readonly url: string;
  readonly ready: boolean;
  readonly bridge: boolean;
  readonly readyTimeoutMs: number;
}): EvidenceGap | null {
  if (!input.ready) {
    return appReadyTimeoutGap(input.url, input.readyTimeoutMs);
  }
  return input.bridge ? null : orbBridgeGap(input.url);
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

/** The one #109-shaped optional field that must NOT degrade gracefully (#1071). The other optional
 *  snapshot members fall back to STRICTER behavior when a `--ref` bundle predates them: an absent
 *  `virtualizedCls` reads as "nothing was virtualized", which reproduces the pre-#109 verdict. This one
 *  is the opposite — the fallback (`cls`) is precisely the number Chrome emptied of the measured click's
 *  own storm, so accepting it would restore the paid false PASS instead of merely losing a refinement.
 *  Only raised for a window that actually dispatched trusted input; entry windows never need it. */
export function observedClsGap(): EvidenceGap {
  return {
    evidence: "the observed CLS total",
    detail:
      "this run dispatched a real trusted click into the measured window, so Chrome excluded every shift within 500ms of it from `cls` — but the page's __orb.motion() carries no `observedCls`, so the instability the click caused was never measured. The spec `cls` is NOT a substitute here (that substitution is the #1071 false PASS: 0.207 observed vs 0.0177 gated on the docked panel toggle). Measure against a bundle that postdates #1071, or drop --selector and audit the entry window instead",
  };
}

/** The TRANSIENT animation population is unobservable on this page (#1070). Not a soft degrade: the
 *  dirty-animation budget's other input is a `document.getAnimations()` SAMPLE at window end, and every
 *  house duration is 130/220/360ms — so without the flag ring the budget is a continuous-loop detector
 *  and a clean verdict from it would be the blindness this instrument was fixed to remove. */
export function flagRingGap(): EvidenceGap {
  return {
    evidence: "the __orb motion-flag ring",
    detail:
      "the page exposes no __orb.flags() — the transient animation population (every dirty transition that STARTED inside the measured window) cannot be observed, and the end-of-window animations() sample alone can only see animations still running ~2s after a 130-360ms house transition ended. A dirty-animation verdict from that half is not a verdict; measure against a bundle that postdates #1070",
  };
}

/** Every input the PASS/FAIL verdict reads that this run did not actually observe. Empty ⇒ the numbers
 *  below are real and the budget arms may speak. RAW frames, never budgeted: an all-classified budgeted
 *  population is honestly empty (the exemption consumed it) and the raw evidence still exists. */
export function motionEvidenceGaps(data: AuditData, windowMs: number): EvidenceGap[] {
  const gaps: EvidenceGap[] = [];
  if (data.measuredInput && clsBudgeted(data.motion, true) === null && data.motion !== null) {
    gaps.push(observedClsGap());
  }
  if (data.environment.mismatches.length > 0) {
    gaps.push({
      evidence: "the requested browser environment",
      detail: `the live page did not match the launcher-owned device contract: ${data.environment.mismatches.join("; ")} — a viewport-only or partial device arm is not a mobile measurement`,
    });
  }
  if (data.motion === null) {
    gaps.push({
      evidence: "the __orb motion snapshot",
      detail: "the in-page observers reported nothing (bridge present, snapshot absent) — the LoAF and CLS budgets have no evidence to judge",
    });
  }
  if (data.flags === null) {
    gaps.push(flagRingGap());
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
  printVerdict("motion-audit", {
    verdict: EXIT.toolError,
    denominators: {},
    pairs: [
      ["verdict", INSTRUMENT_ERROR_VERDICT],
      ["absent-evidence", gap.evidence],
    ],
  });
}
