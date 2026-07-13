// The check harness — shared types + a ts-morph project loader. POST-LEGACY-ORACLE-BURNDOWN: the live
// gate authority is the single-pass machine (loader → pass → render); the legacy `Check`/`runChecks`
// oracle retired. What survives here is the shared `Check`/`Violation`/`CheckContext`/`GateResult` types +
// `getProject`, still consumed by: the two injectable-baseline factories a residual self-test drives
// (`createNoTestFabrication`, `createWarningCodeCoverage`), the retained `monotonicTests` Check (its
// residual test), `gen-fabrication-baseline.ts` (getProject), and report.ts's JSON writer (GateResult).
// Run via tsx (type-stripped); biome lints these too (scripts/ relaxes console/default-export/naming,
// strictness otherwise applies — hence type-aliases, braces, explicit returns below).
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
