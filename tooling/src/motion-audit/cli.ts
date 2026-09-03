// motion-audit — the smoothness ground-truth harness. Argv parse + dispatch ONLY (the five-slot cap);
// the programmatic surface is ./index.ts.
//
// Boots headless chromium against the running dev stack (`pnpm stack start` first), throttles the CPU
// 4× (so the frame budget is meaningful, not masked by dev-machine headroom), drives the argv-ordered
// REACH queue (never measured — the in-page evidence is reset after the last hop), then traces the
// measured window and reads two signal kinds: __orb.motion()/__orb.animations() (the in-page observers:
// LoAF ring, CLS, compositor-clean classification) and a CDP performance trace (the ground-truth
// "Percent Dropped Frames" no in-page API exposes).
//
// HEADLESS CAVEAT: a headless chromium has NO real vsync/GPU present loop, so the dropped-frame % is
// ADVISORY here — confirm a borderline case with `--vnc` (headful) or a GPU runner. LoAF blocking,
// styleAndLayoutStart>0, CLS and compositor-clean come from real main-thread work and are honest
// headless.
//
// PASS/FAIL budget (any breach fails the exit code): a budgeted LoAF with style/layout in-frame · a
// budgeted worst blocking > 50ms · CLS > 0.1 on the basis this run is entitled to — the NON-VIRTUALIZED
// spec total for an ENTRY/navigation window, the OBSERVED non-virtualized total once a `--selector`
// click actually dispatched (issue #109 keeps virtual-row reconciliation printed, labeled and never
// gated; #1071 owns the basis switch, and the RESULT line carries `measured-input` + `cls-budget-basis`
// so the verdict is re-derivable) · any dirty animation in EITHER population — the end-of-window
// `animations()` sample (still-running loops) or the `__orb.flags()` `anim` ring (every dirty transition
// that STARTED in the window; #1070, because a 130–360ms house transition is over ~2s before the sample),
// deduplicated and minus the #953 Base UI height allowance · budgeted
// dropped-frames > 5% (advisory headless) OVER A POPULATION THAT CAN CARRY THAT RATE — below the derived
// resolution floor (#1127) the percentage is a denominator artefact, so since #1148 the dropped-frame arm
// is simply NOT JUDGED there and `frames-budget=unjudged` says so on the RESULT line; every other budget
// still gates the run, and an EMPTY population remains the hard evidence gap below. A failed reach action
// is a FAILED run: the alternative is a smoothness number for the wrong surface.
//
// ZERO HYGIENE (#409): a run that OBSERVED NOTHING is not a verdict. No `__orb` bridge, no in-page
// motion snapshot, or an empty frame population (nothing composited in the measured window) exits
// EXIT.toolError naming what was absent — never `0%` / PASS. Same posture for a measured CLICK against a
// bundle with no `observedCls` (`--isolated --ref <pre-#1071 sha> --selector …`): the spec `cls` is not a
// substitute there, so the run refuses instead of restoring the false PASS. Same for a bridge with no
// `flags()` member at all: an UNOBSERVABLE transient population is not an empty one, and a clean verdict
// from the sampler half alone is the #1070 blindness. lib/evidence.ts carries the receipts.
//
// Exit: 0 pass · 1 budget breach / failed action / page error · EXIT.toolError when the evidence was
// absent · EXIT.misuse on a bad CLI.
import process from "node:process";
import { withInstrumentRun } from "../_shared/artifact-out.ts";
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool } from "../_shared/run-tool.ts";
import { MOTION_AUDIT_HELP, parseMotionArgs, runMotionAudit, runMotionAuditMatrix } from "./index.ts";

async function main(): Promise<number> {
  const opts = parseMotionArgs(process.argv.slice(2));
  if (opts.errors.length > 0) {
    for (const message of opts.errors) {
      print(`ARG ERROR    ${message}`);
    }
    print("");
    print(MOTION_AUDIT_HELP);
    return EXIT.misuse;
  }
  if (opts.help) {
    print(MOTION_AUDIT_HELP);
    return 0;
  }
  // The run's own artifact slot; `reports/motion-audit/<route>-matrix.json` is its published pointer (#1164).
  return await withInstrumentRun("motion-audit", async () => (opts.matrix ? await runMotionAuditMatrix(opts) : await runMotionAudit(opts)));
}

await runTool(main);
