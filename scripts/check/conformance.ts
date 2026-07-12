// The loader-driven conformance runner (TSMORPH-SINGLE-PASS-AUDIT.md §1.6): every descriptor's
// mustFlag/mustPass examples are run through the SAME dispatcher (pass.ts) over an example project — the
// standing "it bites / it doesn't over-bite" proof, replacing the per-gate int test's break-RED-restore
// ritual. A mis-proven gate means the CHECKER is wrong → a conformance failure is a TOOL error (exit 2),
// not a violation (§9.4).
//
// TWO substrates: a pure-AST gate's example is an IN-MEMORY Project (no disk, ~ms). An `fsBacked` gate's
// hooks read the real filesystem (readdirSync/existsSync/readFileSync), so its example is MATERIALIZED
// into a real auto-cleaned temp dir and loaded as a real-fs Project rooted there (the `withTree` mechanics
// from _support.ts, promoted into the runner) — the runner picks the substrate off the descriptor.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Project } from "ts-morph";
import type { Finding, GateDescriptor, GateExample } from "./contract.ts";
import { runPass } from "./pass.ts";

const VROOT = "/repo";

/** A conformance failure: an example that bit when it shouldn't (or vice-versa). */
export type ConformanceFailure = {
  readonly gate: string;
  readonly arm: "mustFlag" | "mustPass";
  readonly why: string;
  readonly detail: string;
};

/** The default virtual path a single-snippet example lands at when the gate doesn't specify `at`.
 *  Picks a path the gate's scanRoot accepts, so the snippet is actually in-scope. */
const DEFAULT_EXAMPLE_PATH = "packages/ui/src/x/x.tsx";
const EXAMPLE_PATH_CANDIDATES: readonly string[] = [
  DEFAULT_EXAMPLE_PATH,
  "packages/client/src/features/x/components/x.tsx",
  "packages/server/src/domain/x/x.ts",
  "packages/db/src/schema/x.ts",
  "tests/tooling/x.ts",
];

function defaultPathFor(gate: GateDescriptor): string {
  if (gate.scanRoot === undefined) {
    return DEFAULT_EXAMPLE_PATH;
  }
  return EXAMPLE_PATH_CANDIDATES.find((p) => gate.scanRoot?.(p)) ?? DEFAULT_EXAMPLE_PATH;
}

/** The example's (repo-relative path → source) map, resolving the single-snippet form to its `at`. */
function exampleFiles(ex: GateExample, gate: GateDescriptor): Record<string, string> {
  return typeof ex.files === "string"
    ? { [ex.at ?? defaultPathFor(gate)]: ex.files }
    : { ...ex.files };
}

/** Materialize an example into an in-memory Project (the pure-AST substrate). */
function inMemoryExampleProject(ex: GateExample, gate: GateDescriptor): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [rel, text] of Object.entries(exampleFiles(ex, gate))) {
    project.createSourceFile(`${VROOT}/${rel}`, text);
  }
  return project;
}

/** Run ONE gate standalone over an example project at `root` — the same begin→walk→run→finalize path as
 *  the real run, so an example proves the gate under the real plumbing, not a parallel harness. A DORMANT
 *  gate is run as-active here (runPass skips dormant gates in the real run) so its proofs still hold — a
 *  dormant gate must be correct so it can be activated. */
function runGateStandalone(
  gate: GateDescriptor,
  project: Project,
  root: string,
): readonly Finding[] {
  const asActive: GateDescriptor = gate.status === "active" ? gate : { ...gate, status: "active" };
  const result = runPass([asActive], {
    root,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  const gateResult = result.gates.find((g) => g.name === gate.name);
  return gateResult?.findings ?? [];
}

/** Run an `fsBacked` gate's example by MATERIALIZING its files into a real auto-cleaned temp dir and
 *  loading a real-fs Project rooted there — so the gate's readdirSync/existsSync/readFileSync calls see a
 *  real disk tree. The temp dir IS the root, so the gate's own path filters (which look for
 *  `/packages/...`) match the same way they do on the real repo. */
function runFsBackedExample(gate: GateDescriptor, ex: GateExample): readonly Finding[] {
  const root = mkdtempSync(join(tmpdir(), "orb-conformance-"));
  try {
    for (const [rel, text] of Object.entries(exampleFiles(ex, gate))) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
    }
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    project.addSourceFilesAtPaths([`${root}/**/*.ts`, `${root}/**/*.tsx`]);
    return runGateStandalone(gate, project, root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Run one example on the substrate the descriptor declares: a real temp-dir tree for `fsBacked` gates
 *  (their hooks read disk), else an in-memory Project. */
function runExample(gate: GateDescriptor, ex: GateExample): readonly Finding[] {
  return gate.fsBacked === true
    ? runFsBackedExample(gate, ex)
    : runGateStandalone(gate, inMemoryExampleProject(ex, gate), VROOT);
}

/** Did the findings satisfy a mustFlag example's precision expectations (count/line/messageIncludes)?
 *  The reason lives on the gate descriptor (owner ruling 2), so `messageIncludes` matches against the
 *  gate's `message` (or a per-occurrence override, when a finding carries one). */
function matchesExpect(
  findings: readonly Finding[],
  ex: GateExample,
  gateMessage: string,
): boolean {
  if (findings.length === 0) {
    return false;
  }
  const exp = ex.expect;
  if (exp === undefined) {
    return true;
  }
  if (exp.count !== undefined && findings.length !== exp.count) {
    return false;
  }
  if (exp.line !== undefined && !findings.some((f) => f.line === exp.line)) {
    return false;
  }
  if (exp.messageIncludes !== undefined) {
    const needle = exp.messageIncludes;
    return findings.some((f) => (f.message ?? gateMessage).includes(needle));
  }
  return true;
}

function checkArm(
  gate: GateDescriptor,
  arm: "mustFlag" | "mustPass",
  examples: readonly GateExample[],
  out: ConformanceFailure[],
): void {
  const wantBite = arm === "mustFlag";
  for (const ex of examples) {
    const findings = runExample(gate, ex);
    // mustFlag → the example must bite (with its precision); mustPass → it must stay clean.
    const ok = wantBite ? matchesExpect(findings, ex, gate.message) : findings.length === 0;
    if (!ok) {
      out.push({
        gate: gate.name,
        arm,
        why: ex.why ?? "(no rationale given)",
        detail: wantBite
          ? `expected a finding${describeExpect(ex)} but got ${findings.length}`
          : `expected NO finding but got ${findings.length}: ${findings.map((f) => f.message).join("; ")}`,
      });
    }
  }
}

function describeExpect(ex: GateExample): string {
  const exp = ex.expect;
  if (exp === undefined) {
    return "";
  }
  const parts: string[] = [];
  if (exp.count !== undefined) {
    parts.push(`count=${exp.count}`);
  }
  if (exp.line !== undefined) {
    parts.push(`line=${exp.line}`);
  }
  if (exp.messageIncludes !== undefined) {
    parts.push(`message⊇"${exp.messageIncludes}"`);
  }
  return parts.length === 0 ? "" : ` (${parts.join(", ")})`;
}

/** Verify every mustFlag/mustPass example for the given gates. Empty result = all gates conform. */
export function verifyGateProofs(gates: readonly GateDescriptor[]): readonly ConformanceFailure[] {
  const out: ConformanceFailure[] = [];
  for (const gate of gates) {
    checkArm(gate, "mustFlag", gate.mustFlag, out);
    checkArm(gate, "mustPass", gate.mustPass, out);
  }
  return out;
}
