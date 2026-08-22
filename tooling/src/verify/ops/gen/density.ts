// Generator for tooling/src/verify/gates/density-tier.baseline.json — the transition ratchet the density-tier
// gate reads (docs/design/density-pass-spec.md §5.2). Runs the SAME detector the gate uses over every
// client/ui source and writes {repo-relative path → violation count} for files with ≥1 budgeted (A1–A3)
// finding. Re-run it at the END of every density sweep stage and commit the SHRINK in the same commit —
// a baseline that GROWS in a diff is a review-blocking defect, and the terminal state is `{}` + this file
// and the baseline deleted.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { densityFindings } from "../../gates/density-tier.ts";
import { getProject } from "../../lib/harness.ts";

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

  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const out = join(root, "tooling/src/verify/gates/density-tier.baseline.json");
  writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`);
  process.stdout.write(`wrote ${Object.keys(sorted).length} files, ${total} violations → ${out}\n`);
  return EXIT.clean;
}
