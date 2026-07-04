// The check harness — shared types + a ts-morph project loader + the runner.
// Each gate is a `Check` returning `Violation[]`; `report.ts` registers them and runs.
// Run via tsx (type-stripped); biome lints these too (scripts/ relaxes console/default-export/naming,
// strictness otherwise applies — hence type-aliases, braces, explicit returns below).
import process from "node:process";
import { Project } from "ts-morph";

export type Violation = {
  readonly file: string;
  readonly line: number;
  readonly message: string;
};

export type CheckContext = {
  readonly root: string;
  readonly project: Project;
};

export type Check = {
  readonly name: string;
  readonly run: (ctx: CheckContext) => Violation[];
};

let cached: Project | undefined;

/** A ts-morph project over all package source (no tsconfig — pure AST, no type-graph needed). */
export function getProject(root: string): Project {
  if (cached !== undefined) {
    return cached;
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths([
    `${root}/packages/*/src/**/*.ts`,
    `${root}/packages/*/src/**/*.tsx`,
    `${root}/tests/**/*.ts`,
    `${root}/tests/**/*.tsx`,
  ]);
  cached = project;
  return project;
}

/** One gate's outcome, retained so callers that need per-gate detail (the check-structure.json
 *  writer) don't have to re-run the gate to get it. */
export type GateResult = {
  readonly name: string;
  readonly ok: boolean;
  readonly violations: readonly Violation[];
};

/** `runChecks`' return: the violation total (the CALLER owns the exit code — report.ts exits 1 on
 *  any violation, file.ts folds it into its own step ledger) PLUS every gate's own result, so a
 *  single run can serve both the stdout report and any structured (JSON) report without re-walking
 *  the project a second time. */
export type RunChecksResult = {
  readonly total: number;
  readonly gates: readonly GateResult[];
};

/** Runs the given gates once, prints per-gate results + the summary footer, and returns both the
 *  violation total and each gate's own result (name/ok/violations) — the single source both the
 *  stdout report and a structured (JSON) report are built from. */
export function runChecks(checks: readonly Check[]): RunChecksResult {
  const root = process.cwd();
  const ctx: CheckContext = { root, project: getProject(root) };
  let total = 0;
  const gates: GateResult[] = [];
  for (const check of checks) {
    const violations = check.run(ctx);
    gates.push({ name: check.name, ok: violations.length === 0, violations });
    if (violations.length === 0) {
      process.stdout.write(`  ✓ ${check.name}\n`);
      continue;
    }
    total += violations.length;
    process.stdout.write(`  ✗ ${check.name} (${violations.length})\n`);
    for (const v of violations) {
      const loc = v.line > 0 ? `${v.file}:${v.line}` : v.file;
      process.stdout.write(`      ${loc} — ${v.message}\n`);
    }
  }
  if (total > 0) {
    process.stdout.write(`\nstructure check: ${total} violation(s)\n`);
    return { total, gates };
  }
  process.stdout.write("\nstructure check: clean\n");
  return { total: 0, gates };
}
