// One-shot generator for tooling/src/verify/gates/no-test-fabrication.baseline.json — the ratchet floor the
// no-test-fabrication gate reads. Runs the SAME detector the gate uses over every tests/ source and
// writes {tests/-relative path → fabrication count} for files with ≥1 site. Re-run this ONLY on a
// sanctioned bulk shift; day-to-day the count can only fall.
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { readBudgetRows, writeBudgetLedger } from "@orb/tooling/_shared/ratchet-rows";
import { BASELINE_REL, fabricationSites, testsRel } from "../../gates/no-test-fabrication.ts";
import { getProject } from "../../lib/harness.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/verify/cli.ts baseline fabrication");

/** The `baseline fabrication` verb — the SINGLE writer of its committed baseline (GATE-AUTHORING §4.8). */
export function generateFabricationBaseline(root: string): number {
  const project = getProject(root);
  const counts: Record<string, number> = {};

  for (const sf of project.getSourceFiles()) {
    const rel = testsRel(sf.getFilePath());
    if (rel === undefined) {
      continue;
    }
    const n = fabricationSites(sf).length;
    if (n > 0) {
      counts[rel] = n;
    }
  }

  // COUNTS re-derived, CLASS carried (#569). Every fabrication row is debt today; carrying rather than
  // resetting is what makes that a fact of the ledger instead of an assumption of the writer.
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const rows = writeBudgetLedger(root, BASELINE_REL, counts, readBudgetRows(root, BASELINE_REL));
  process.stdout.write(`wrote ${rows} files, ${total} sites → ${BASELINE_REL}\n`);
  return EXIT.clean;
}
