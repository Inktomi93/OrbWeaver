// Generator for scripts/check/gates/gate-modernization.baseline.json — the RETRO handoff ledger arm B
// suppresses (scripts/check/GATE-AUTHORING.md §4.8). Runs the SAME detector the gate uses over the gate
// corpus and writes {gate file → the one-sided exemption collections it still carries}. Re-run it after
// every burn-down batch and commit the SHRINK in the same commit — a baseline that GROWS in a diff is a
// review-blocking defect. Terminal state: `{}`, then delete this file AND the baseline.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { Project } from "ts-morph";
import { exemptionCollections, hasStaleArm } from "./gates/gate-modernization.ts";

const OUT_REL = "scripts/check/gates/gate-modernization.baseline.json";
const GATES_GLOB = "scripts/check/gates/*.ts";
const PROBE_RE = /(^|\/)__(?:g|dc)_/u;

const root = process.cwd();
const project = new Project({ skipAddingFilesFromTsConfig: true });
project.addSourceFilesAtPaths(join(root, GATES_GLOB));

const rows: Record<string, string[]> = {};
for (const sf of project.getSourceFiles()) {
  const abs = sf.getFilePath();
  const rel = abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
  if (PROBE_RE.test(rel) || hasStaleArm(sf)) {
    continue;
  }
  const names = exemptionCollections(sf).map((c) => c.name);
  if (names.length > 0) {
    rows[rel] = names.sort((a, b) => a.localeCompare(b));
  }
}

const entries = Object.entries(rows).sort(([a], [b]) => a.localeCompare(b));
const total = entries.reduce((n, [, names]) => n + names.length, 0);
// Hand-serialized so each gate's array stays on ONE line — `JSON.stringify(…, 2)` explodes short arrays
// across lines and biome's formatter (which polices this file) would then rewrite it every commit.
const body = entries.map(([rel, names]) => `  ${JSON.stringify(rel)}: [${names.map((n) => JSON.stringify(n)).join(", ")}]`).join(",\n");
writeFileSync(join(root, OUT_REL), `{\n${body}\n}\n`);
process.stdout.write(`wrote ${entries.length} gates, ${total} one-sided exemption tables → ${OUT_REL}\n`);
