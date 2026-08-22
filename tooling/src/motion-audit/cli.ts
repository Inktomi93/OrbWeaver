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
// budgeted worst blocking > 50ms · NON-VIRTUALIZED CLS > 0.1 (issue #109 — virtual-row reconciliation
// is printed, labeled, never gated) · any active animation with compositorClean:false · budgeted
// dropped-frames > 5% (advisory headless). A failed reach action is a FAILED run: the alternative is a
// smoothness number for the wrong surface.
//
// ZERO HYGIENE (#409): a run that OBSERVED NOTHING is not a verdict. No `__orb` bridge, no in-page
// motion snapshot, or an empty frame population (nothing composited in the measured window) exits
// EXIT.toolError naming what was absent — never `0%` / PASS. lib/evidence.ts carries the receipts.
//
// Exit: 0 pass · 1 budget breach / failed action / page error · EXIT.toolError when the evidence was
// absent · EXIT.misuse on a bad CLI.
import process from "node:process";
import { print } from "../_shared/artifacts.ts";
import { EXIT } from "../_shared/exit-contract.ts";
import { runTool } from "../_shared/run-tool.ts";
import { MOTION_AUDIT_HELP, parseMotionArgs, runMotionAudit } from "./index.ts";

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
  return await runMotionAudit(opts);
}

await runTool(main);
