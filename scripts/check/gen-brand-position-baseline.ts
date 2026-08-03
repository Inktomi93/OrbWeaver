// Generator for scripts/check/gates/brand-in-name-position.baseline.json — the transition ratchet that gate
// reads. Runs the SAME detector the gate uses (`brandPositionFindings`, over the SAME derived vocabulary) and
// writes {repo-relative path → violation count} for every file with ≥1 unmarked finding. Re-run it at the END
// of every burn-down stage and commit the SHRINK in the same commit — a baseline that GROWS in a diff is a
// review-blocking defect, and the terminal state is `{}` + this file and the baseline deleted.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { brandPositionFindings, deriveBrandPositions, inScope, repoRel } from "./gates/brand-in-name-position.ts";
import { getProject } from "./harness.ts";

const root = process.cwd();
const project = getProject(root);
const sourceFiles = project.getSourceFiles();
const positions = deriveBrandPositions(sourceFiles);
if (positions.size === 0) {
  throw new Error("gen-brand-position-baseline: derived ZERO brand positions — refusing to write an all-green baseline from a broken derivation");
}

const counts: Record<string, number> = {};
for (const sf of sourceFiles) {
  if (!inScope(sf.getFilePath())) {
    continue;
  }
  const rel = repoRel(sf.getFilePath());
  const n = brandPositionFindings(sf, rel, positions).length;
  if (n > 0) {
    counts[rel] = n;
  }
}

const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
const out = join(root, "scripts/check/gates/brand-in-name-position.baseline.json");
writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`);
process.stdout.write(`wrote ${Object.keys(sorted).length} files, ${total} violations → ${out}\n`);
