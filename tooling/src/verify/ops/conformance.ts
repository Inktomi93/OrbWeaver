// Runs every gate's mustFlag/mustPass examples through the same dispatcher (pass.ts) over an example
// project. A mis-proven gate means the CHECKER is wrong → a conformance failure is a TOOL error (exit 2),
// not a violation.
//
// TWO substrates: a pure-AST gate's example lands on ONE reused in-memory Project, under its own virtual
// root (#780 — see `loadInMemoryExample` for why both halves of that are load-bearing). An `fsBacked` gate's
// hooks read the real filesystem, so its example is materialized into a real auto-cleaned temp dir instead.
//
// A GATE MUST NOT CACHE ON PROJECT IDENTITY (GATE-AUTHORING.md §12). The in-memory Project is now
// shared across every example, so a `WeakMap<Project, …>` memo serves a PREVIOUS example's derivation and
// the gate silently changes verdict. Derive per PASS (a `begin`-scoped value) instead.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { execNicedSync } from "@orb/tooling/_shared/proc";
import { Project } from "ts-morph";
import type { Finding, GateDescriptor, GateExample } from "../contract/gate.ts";
import type { PassResult } from "../contract/pass.ts";
import type { ConformanceFailure } from "../contract/scoped.ts";
import { runPass } from "../lib/pass.ts";
import { assertPolicyRepoPath } from "../lib/policy-repo-inventory.ts";
import { namesGitControlSegment } from "../lib/policy-validation.ts";

refuseDirectInvocation(import.meta.url, "pnpm test:scoped tests/tooling/gate-conformance.repo.int.test.ts");

const VROOT = "/repo";

/** The default virtual path a single-snippet example lands at when the gate doesn't specify `at`. */
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
  return EXAMPLE_PATH_CANDIDATES.find((p) => gate.scanRoot?.(p) === true) ?? DEFAULT_EXAMPLE_PATH;
}

/** The example's (repo-relative path → source) map, resolving the single-snippet form to its `at`. */
function exampleFiles(ex: GateExample, gate: GateDescriptor): Record<string, string> {
  return typeof ex.files === "string" ? { [ex.at ?? defaultPathFor(gate)]: ex.files } : { ...ex.files };
}

/** Every example destination is a repo-relative POSIX path in the shared inventory grammar (#2333), checked
 *  before either substrate creates a root or removes the previous example. Both doors compose the key onto a
 *  root — `join(root, key)` on disk, `${root}/${key}` in memory — so a `..` segment would write outside the
 *  temp root (surviving its reap) or outside this example's virtual root. `node_modules/...` stays valid:
 *  installed-package fixtures plant real package files. */
function assertExampleDestinations(files: Readonly<Record<string, string>>): void {
  for (const key of Object.keys(files)) {
    assertPolicyRepoPath(key, "example destination");
    if (namesGitControlSegment(key)) {
      throw new Error(`example destination names a .git control segment: ${key}`);
    }
  }
}

/** Monotonic per PROCESS, never reset. It is what guarantees the invariant below — that no virtual path is
 *  ever created twice on a reused Project — across every `verifyGateProofs` call in a run. */
let exampleSeq = 0;

/** Load ONE example onto a reused in-memory Project and return the virtual ROOT it landed under.
 *
 *  AMORTIZE THE SUBSTRATE (#780). This used to build a FRESH `Project` per example. ~105ms of every one of
 *  the ~1500 in-memory examples was TypeScript parsing the bundled lib.d.ts on that project's FIRST type
 *  query — substrate, not any gate's logic (gate-free control: fresh project + one `.getType()` = 104.43ms;
 *  the SECOND query on the same project = 0.053ms; a pure AST walk = 0.17ms). Reusing one Project pays that
 *  once. Measured across the whole in-memory corpus: 20.6s → 3.3s; on the standing bite-proof
 *  (`tests/tooling/gate-conformance.repo.int.test.ts`, same box, back-to-back, loadavg ~22): 27.6s → 7.9s.
 *
 *  THE UNIQUE ROOT IS THE CORRECTNESS HALF, not tidiness. Removing the previous example's files and
 *  re-creating the NEXT one at the SAME virtual path corrupts the language service: a re-created SourceFile
 *  restarts its script version, so the LS serves the PREVIOUS document's snapshot and
 *  `Identifier.getDefinitionNodes()` returns definitions at stale positions (measured on
 *  baseui-portal-container-seam: fresh `defs=[BindingElement@L6]`, reused-same-path `defs=[]`) — every gate
 *  that resolves a declaration through the language service silently changes verdict. Giving each example
 *  its own root means no path is ever re-created, and the finding-level equivalence sweep pinned in
 *  tests/tooling/verify/ops/conformance.int.test.ts then reports byte-identical findings across
 *  1461 examples against the fresh-per-example substrate.
 *
 *  The files of the previous example are still REMOVED: a gate is entitled to see exactly its own example's
 *  file set (`ctx.project.getSourceFiles()` is how whole-project gates read the corpus). */
export function loadInMemoryExample(project: Project, files: Readonly<Record<string, string>>): string {
  assertExampleDestinations(files);
  for (const previous of project.getSourceFiles()) {
    project.removeSourceFile(previous);
  }
  exampleSeq += 1;
  const root = `${VROOT}-${exampleSeq}`;
  for (const [rel, text] of Object.entries(files)) {
    project.createSourceFile(`${root}/${rel}`, text);
  }
  return root;
}

/** Run ONE gate standalone over an example project — the same begin→walk→run→finalize path as the real
 *  run. A dormant gate is run as-active here (runPass skips dormant gates in the real run) so its proof
 *  still holds. */
function runGateStandalone(gate: GateDescriptor, project: Project, root: string): PassResult {
  const asActive: GateDescriptor = gate.status === "active" ? gate : { ...gate, status: "active" };
  return runPass([asActive], {
    root,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
}

/** The TS source extensions the fs-backed substrate loads into the Project. An example may materialize a
 *  `.md` / `.css` / `.json` too (dangling-refs plants docs, over-art-plate-arm a stylesheet, a ratchet gate
 *  its baseline) — those are on DISK for the gate's own `readFileSync` and must stay OUT of the project, so
 *  the filter is part of the contract, not an optimisation detail. */
const TS_SOURCE_RE = /\.tsx?$/u;

/** Run an `fsBacked` gate's example by materializing its files into a real auto-cleaned temp dir and
 *  loading a real-fs Project rooted there, so its readdirSync/existsSync/readFileSync calls see real disk.
 *
 *  RESOLVE ONCE (#779). This used to re-DISCOVER the files it had just written, with
 *  `addSourceFilesAtPaths([root/**\/*.ts, root/**\/*.tsx])` — a recursive glob per example, measured at
 *  **50.7ms** against **0.7ms** for adding the known paths directly (10-iteration means, 3-file example, on
 *  the same loaded box). Nothing else in the substrate is close: mkdtemp+write 0.8ms, `new Project` 0.9ms,
 *  the gate's own `run` 0.2ms. Across the 330 fs-backed examples that glob WAS the bite-proof's runtime, and
 *  it grew with every example any gate added — which is how a 30s proof reached 43s against a 45s budget
 *  while every individual gate stayed cheap. The writer already knows every path; asking the filesystem to
 *  find them again is the resolve-twice. Verified identical project file sets across both doors, including
 *  the non-TS files the filter must exclude. */
function runFsBackedExample(gate: GateDescriptor, ex: GateExample): PassResult {
  const files = exampleFiles(ex, gate);
  assertExampleDestinations(files);
  const root = mkdtempSync(join(tmpdir(), "orb-conformance-"));
  try {
    // Compiler membership uses the same authored Git inventory in fixtures and real runs.
    execNicedSync("git", ["init", "--quiet", "--template=", "--initial-branch=main"], { cwd: root });
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    for (const [rel, text] of Object.entries(files)) {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, text);
      if (TS_SOURCE_RE.test(rel)) {
        project.addSourceFileAtPath(abs);
      }
    }
    return runGateStandalone(gate, project, root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** Run one example on the substrate the descriptor declares. `shared` is the reused in-memory Project; an
 *  `fsBacked` gate ignores it entirely (its substrate is a real temp dir + a real-fs Project, #779). */
function runExample(gate: GateDescriptor, ex: GateExample, shared: Project): PassResult {
  if (gate.fsBacked === true) {
    return runFsBackedExample(gate, ex);
  }
  const root = loadInMemoryExample(shared, exampleFiles(ex, gate));
  return runGateStandalone(gate, shared, root);
}

/** Did the findings satisfy a mustFlag example's precision expectations (count/line/token/messageIncludes)?
 *  `messageIncludes` matches against the gate's `message` (or a finding's own override); `token` matches the
 *  finding's own `token`, which is the ONLY precision a multi-arm token-emitting gate has (every arm's
 *  needle would match the one group message). */
function matchesExpect(findings: readonly Finding[], ex: GateExample, gateMessage: string): boolean {
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
  if (exp.token !== undefined && !findings.some((f) => f.token === exp.token)) {
    return false;
  }
  if (exp.messageIncludes !== undefined) {
    const needle = exp.messageIncludes;
    return findings.some((f) => (f.message ?? gateMessage).includes(needle));
  }
  return true;
}

function checkArm(gate: GateDescriptor, arm: "mustFlag" | "mustPass", out: ConformanceFailure[], shared: Project): void {
  const wantBite = arm === "mustFlag";
  for (const ex of wantBite ? gate.mustFlag : gate.mustPass) {
    const result = runExample(gate, ex, shared);
    const findings = result.gates.find((g) => g.name === gate.name)?.findings ?? [];
    if (result.toolErrors.length > 0) {
      out.push({
        gate: gate.name,
        arm,
        why: ex.why ?? "(no rationale given)",
        detail: `TOOL ERROR while proving example: ${result.toolErrors.map((e) => `[${e.phase}] ${e.message}`).join("; ")}`,
      });
      continue;
    }
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
  if (exp.token !== undefined) {
    parts.push(`token="${exp.token}"`);
  }
  if (exp.messageIncludes !== undefined) {
    parts.push(`message⊇"${exp.messageIncludes}"`);
  }
  return parts.length === 0 ? "" : ` (${parts.join(", ")})`;
}

/** Verify every mustFlag/mustPass example for the given gates. Empty result = all gates conform. */
export function verifyGateProofs(gates: readonly GateDescriptor[]): readonly ConformanceFailure[] {
  const out: ConformanceFailure[] = [];
  // ONE in-memory Project for every pure-AST example in this call (see `loadInMemoryExample`).
  const shared = new Project({ useInMemoryFileSystem: true });
  for (const gate of gates) {
    checkArm(gate, "mustFlag", out, shared);
    checkArm(gate, "mustPass", out, shared);
  }
  return out;
}
