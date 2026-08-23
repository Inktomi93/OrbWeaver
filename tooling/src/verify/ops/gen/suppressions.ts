// One-shot generator for tooling/src/verify/gates/suppressions.baseline.json — the ratchet floor the
// suppressions gate reads. Runs the SAME detector the gate uses over every packages/*/src source and
// writes {repo-relative path → suppression-marker count} for files with ≥1 site. Re-run this ONLY on a
// sanctioned bulk shift; day-to-day the count can only fall.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { srcRel, suppressionSites } from "../../gates/suppressions.ts";
import { getProject } from "../../lib/harness.ts";

refuseDirectInvocation(import.meta.url, "node tooling/src/verify/cli.ts baseline suppressions");

/** The `baseline suppressions` verb — the SINGLE writer of its committed baseline (GATE-AUTHORING §4.8). */
export function generateSuppressionsBaseline(root: string): number {
  const project = getProject(root);
  const counts: Record<string, number> = {};

  for (const sf of project.getSourceFiles()) {
    const rel = srcRel(root, sf.getFilePath());
    if (rel === undefined) {
      continue;
    }
    const n = suppressionSites(sf).length;
    if (n > 0) {
      counts[rel] = n;
    }
  }

  const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  const total = Object.values(counts).reduce((s, n) => s + n, 0);
  const out = join(root, "tooling/src/verify/gates/suppressions.baseline.json");
  writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`);
  process.stdout.write(`wrote ${Object.keys(sorted).length} files, ${total} sites → ${out}\n`);
  return EXIT.clean;
}
