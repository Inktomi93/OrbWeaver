// Generator for tooling/src/verify/gates/over-art-plate-arm.baseline.json — the transition ratchet the
// over-art plate gate reads (GATE-AUTHORING.md §4.8). Runs the SAME reader the gate uses over every
// client/ui stylesheet and writes {`<file>::<selector subject>::<tint>` → 1} for every plateless surface
// with no `light-dark()` plate arm. It is the SINGLE writer: fix a surface, re-run this, commit the SHRINK
// in the same commit. A baseline that GROWS in a diff is a review-blocking defect; terminal state is `{}`
// plus this file and the ledger deleted.
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { writeBudgetLedger } from "@orb/tooling/_shared/ratchet-rows";
import { BASELINE_REL, loadBaseline } from "../../gates/over-art-plate-arm.ts";
import { judgeStylesheets } from "../../lib/over-art-plate.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/verify/cli.ts baseline over-art-plate-arm");

/** The `baseline over-art-plate-arm` verb — the SINGLE writer of its committed ledger. */
export function generateOverArtPlateBaseline(root: string): number {
  const counts: Record<string, number> = {};
  for (const key of judgeStylesheets(root).live.keys()) {
    counts[key] = 1;
  }
  // COUNTS are re-derived; each row's `why` (measured-vs-structural) and its DEBT/RATIFIED class ride
  // through from the committed ledger — a regenerate must never silently erase what a row was found to be.
  const rows = writeBudgetLedger(root, BASELINE_REL, counts, loadBaseline(root));
  process.stdout.write(`wrote ${rows} unpaired surface(s) → ${BASELINE_REL}\n`);
  return EXIT.clean;
}
