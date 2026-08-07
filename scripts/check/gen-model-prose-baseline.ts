// Generator for scripts/check/gates/no-hardcoded-model-prose.baseline.json — the PROSE-1 S3/S4 transition
// ratchet (the SINGLE writer, GATE-AUTHORING.md §4.8). Runs the gate's OWN detector over every seam file and
// writes {repo-relative path → live prose-unit count}. Re-run at the end of every PROSE-1 stage and commit
// the SHRINK in the same commit; a baseline that GROWS in a diff is a review-blocking defect. Terminal state
// is `{}` — then DELETE the baseline and this file.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { modelProseSites, SEAM_FILES, SEAM_PREFIXES } from "./gates/no-hardcoded-model-prose.ts";
import { getProject } from "./harness.ts";

// The seam list is imported, not re-spelled — the gate is the single writer of the seam vocabulary
// (GATE-AUTHORING.md §4.8); a seam-list edit in the gate alone must not silently desync the baseline.
// The catalogs are OUT here exactly as they are in the gate's isSeam — preset/index.ts is both a legacy
// catalog and inside no seam prefix, so no exclusion is needed beyond the seam list itself.

const root = process.cwd();
const project = getProject(root);
const counts: Record<string, number> = {};

for (const sf of project.getSourceFiles()) {
  const abs = sf.getFilePath();
  const idx = abs.indexOf("/packages/");
  const rel = idx === -1 ? abs : abs.slice(idx + 1);
  const isSeam = SEAM_PREFIXES.some((p) => rel.startsWith(p)) || (SEAM_FILES as readonly string[]).includes(rel);
  if (!isSeam) {
    continue;
  }
  const live = modelProseSites(sf).filter((s) => s.escapedAt === undefined).length;
  if (live > 0) {
    counts[rel] = live;
  }
}

const ordered = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(join(root, "scripts/check/gates/no-hardcoded-model-prose.baseline.json"), `${JSON.stringify(ordered, null, 2)}\n`);
process.stdout.write(`wrote ${Object.keys(ordered).length} baseline rows\n`);
