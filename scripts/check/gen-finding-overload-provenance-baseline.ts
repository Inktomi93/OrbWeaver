// Generator for scripts/check/gates/finding-overload-provenance.baseline.json — the shrink-only ratchet the
// finding-overload-provenance gate reads (GATE-AUTHORING.md §4.8). Runs the SAME derivation the gate uses
// (`unmarkedSites`) over the gate corpus and writes {gate file → count of node-anchored Finding literals not
// absolved by a marker}. It is the single WRITER; the gate is the single READER. Re-run it after converting
// a gate's arms to the node overload and commit the SHRINK in the same commit — a baseline that GROWS in a
// diff is a review-blocking defect, and the terminal state is `{}` + this file and the baseline deleted.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { getWorkspace } from "../ts-workspace.ts";
import { unmarkedSites } from "./gates/finding-overload-provenance.ts";

const GATES_DIR = "scripts/check/gates/";

const root = process.cwd();
// getWorkspace, not harness.ts's getProject: the harness project does NOT load scripts/check/gates/**
// (only packages+tests), so the gate corpus — this generator's entire scan — would come back EMPTY.
const project = getWorkspace({ root });
const counts: Record<string, number> = {};

for (const sf of project.getSourceFiles()) {
  const abs = sf.getFilePath();
  const idx = abs.indexOf(`/${GATES_DIR}`);
  if (idx === -1) {
    continue;
  }
  const rel = abs.slice(idx + 1);
  const n = unmarkedSites(sf).length;
  if (n > 0) {
    counts[rel] = n;
  }
}

const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
const total = Object.values(counts).reduce((s, n) => s + n, 0);
const out = join(root, `${GATES_DIR}finding-overload-provenance.baseline.json`);
writeFileSync(out, `${JSON.stringify(sorted, null, 2)}\n`);
process.stdout.write(`wrote ${Object.keys(sorted).length} gate files, ${total} node-anchored Finding literals → ${out}\n`);
