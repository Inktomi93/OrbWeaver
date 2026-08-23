// Generator for tooling/src/verify/gates/density-tier.baseline.json — the transition ratchet the density-tier
// gate reads (docs/design/density-pass-spec.md §5.2). Runs the SAME detector the gate uses over every
// client/ui source and writes {repo-relative path → violation count} for files with ≥1 budgeted (A1–A3)
// finding. Re-run it at the END of every density sweep stage and commit the SHRINK in the same commit —
// a baseline that GROWS in a diff is a review-blocking defect, and the terminal state is `{}` + this file
// and the baseline deleted.
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { writeBudgetLedger } from "@orb/tooling/_shared/ratchet-rows";
import { BASELINE_REL, densityFindings, loadBaseline } from "../../gates/density-tier.ts";
import { getProject } from "../../lib/harness.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/verify/cli.ts baseline density");

const SCANNED = /\/packages\/(?:client|ui)\/src\//u;

/** The `baseline density` verb — the SINGLE writer of its committed baseline (GATE-AUTHORING §4.8). */
export function generateDensityBaseline(root: string): number {
  const project = getProject(root);
  const counts: Record<string, number> = {};

  for (const sf of project.getSourceFiles()) {
    const path = sf.getFilePath();
    if (!SCANNED.test(path)) {
      continue;
    }
    const idx = path.indexOf("/packages/");
    const rel = idx === -1 ? path : path.slice(idx + 1);
    const n = densityFindings(sf, rel).length;
    if (n > 0) {
      counts[rel] = n;
    }
  }

  // The COUNTS are re-derived; each row's DEBT-vs-RATIFIED class rides through from the committed ledger
  // (#569) — a regenerate must never silently demote a ruling to backlog, or promote one.
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const rows = writeBudgetLedger(root, BASELINE_REL, counts, loadBaseline(root));
  process.stdout.write(`wrote ${rows} files, ${total} violations → ${BASELINE_REL}\n`);
  return EXIT.clean;
}
