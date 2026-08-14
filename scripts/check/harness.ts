// Shared types + a ts-morph project loader. The live gate authority is the single-pass machine
// (loader → pass → render); what survives here is the shared `Check`/`Violation`/`CheckContext`/
// `GateResult` types + `getProject`, still consumed by the injectable-baseline factories, the retained
// `monotonicTests` Check, gen-fabrication-baseline.ts, and report.ts's JSON writer.
import { Project } from "ts-morph";
import type { GateScan } from "./pass.ts";

export type Violation = {
  readonly file: string;
  readonly line: number;
  readonly message: string;
  /** Present only for non-default tiers ("warn" — contract.ts's reserved advisory tier). Absent = error.
   *  Carried into check-structure.json so the artifact stops losing the finding's tier (2026-08-03). */
  readonly severity?: "error" | "warn";
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
  project.addSourceFilesAtPaths([`${root}/packages/*/src/**/*.ts`, `${root}/packages/*/src/**/*.tsx`, `${root}/tests/**/*.ts`, `${root}/tests/**/*.tsx`]);
  cached = project;
  return project;
}

/** One gate's outcome, retained so callers that need per-gate detail (the check-structure.json
 *  writer) don't have to re-run the gate to get it. */
export type GateResult = {
  readonly name: string;
  readonly ok: boolean;
  readonly violations: readonly Violation[];
  /** The DENOMINATOR behind this verdict (pass.ts `GateScan`) — how many files the gate was actually fed,
   *  and what a ratchet baseline admitted. Carried into check-structure.json so the canonical artifact
   *  stops reporting a green gate without saying whether it read anything (Codex GA-H-01/02, 2026-08-13). */
  readonly scan: GateScan;
};
