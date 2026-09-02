// Generator for tooling/src/verify/gates/ui-variant-axes-stamped.baseline.json — the transition ratchet
// behind the @orb/ui variant-axis stamp (#1080, GATE-AUTHORING.md §4.8). It runs the SAME reader the gate
// uses (lib/variant-axis-stamp.ts) over `packages/ui/src` and writes `{"<file>::<recipe>": 1}` for every
// stamped-axis recipe that does not yet reach the seam. SINGLE writer: stamp a primitive, re-run this,
// commit the SHRINK in the same commit. A baseline that GROWS in a diff is a review-blocking defect;
// terminal state is `{}` plus this file and the ledger deleted.
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { writeBudgetLedger } from "@orb/tooling/_shared/ratchet-rows";
import { BASELINE_REL, loadBaseline } from "../../gates/ui-variant-axes-stamped.ts";
import { scanUiPackage } from "../../lib/variant-axis-stamp.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/verify/cli.ts baseline ui-variant-axes-stamped");

/** The `baseline ui-variant-axes-stamped` verb — the SINGLE writer of its committed ledger. */
export function generateUiVariantAxesStampedBaseline(root: string): number {
  const { recipes, stamped } = scanUiPackage(root);
  const counts: Record<string, number> = {};
  for (const recipe of recipes) {
    if (!stamped.has(recipe.name)) {
      counts[recipe.key] = 1;
    }
  }
  // COUNTS are re-derived; each row's `why` and its DEBT/RATIFIED class ride through from the committed
  // ledger — a regenerate must never silently erase what a row was found to be.
  const rows = writeBudgetLedger(root, BASELINE_REL, counts, loadBaseline(root));
  process.stdout.write(`wrote ${rows} unstamped @orb/ui recipe(s) → ${BASELINE_REL}\n`);
  return EXIT.clean;
}
