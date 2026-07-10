// One-shot generator for scripts/check/gates/no-test-fabrication.baseline.json — the RATCHET floor the
// no-test-fabrication gate reads. Runs the SAME detector the gate uses over the harness project (every
// tests/ source) and writes {tests/-relative path → fabrication count} for files with ≥1 site. The gate
// then only fires when a file EXCEEDS its entry (or gains one). Re-run this ONLY on a sanctioned bulk shift
// (`pnpm exec tsx scripts/check/gen-fabrication-baseline.ts`); day-to-day the count can only fall (W1h).
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fabricationSites, testsRel } from "./gates/no-test-fabrication.ts";
import { getProject } from "./harness.ts";

const root = process.cwd();
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

const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
const total = Object.values(counts).reduce((s, n) => s + n, 0);
const out = join(root, "scripts/check/gates/no-test-fabrication.baseline.json");
writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`);
process.stdout.write(`wrote ${Object.keys(sorted).length} files, ${total} sites → ${out}\n`);
