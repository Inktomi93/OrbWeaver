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

/** Runs the given gates and prints per-gate results + the summary footer. Returns the violation
 *  total — the CALLER owns the exit code (report.ts exits 1 on any violation, byte-identical to
 *  when this function exited itself; file.ts folds the count into its own step ledger). */
export function runChecks(checks: readonly Check[]): number {
  const root = process.cwd();
  const ctx: CheckContext = { root, project: getProject(root) };
  let total = 0;
  for (const check of checks) {
    const violations = check.run(ctx);
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
    return total;
  }
  process.stdout.write("\nstructure check: clean\n");
  return 0;
}
