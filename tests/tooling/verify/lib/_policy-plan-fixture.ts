import type { GatePolicy, PolicyCommandRequest, PolicyScopeResolution } from "@orb/tooling/verify";
import { defineGate } from "@orb/tooling/verify";
import { SyntaxKind } from "ts-morph";

/** One branded planner policy for scratch and live-repository scope controls. */
export function policy(
  id: string,
  options: Partial<Pick<GatePolicy, "family" | "execution" | "analysis" | "population" | "facts" | "resources" | "severity" | "create">> = {},
): GatePolicy {
  const analysis = options.analysis ?? "syntax";
  const proofMode = analysis === "syntax" ? "source" : analysis;
  const files = analysis === "resource" ? { "tooling/package.json": "{}\n" } : { "tooling/src/a.ts": "export const a = 1;\n" };
  const resources: GatePolicy["resources"] = options.resources ?? (analysis === "resource" ? [{ kind: "package-metadata", id: "tooling" }] : []);
  const base = {
    id,
    family: options.family ?? id,
    authority: "hard",
    population: options.population ?? "@tooling",
    analysis,
    execution: options.execution ?? "selected-files",
    facts: options.facts ?? [],
    resources,
    message: `${id} message`,
    fix: `waive with @orb-waive ${id}(position): reason`,
    create:
      options.create ?? ((): ReturnType<GatePolicy["create"]> => ({ visitors: [{ kinds: [SyntaxKind.VariableDeclaration], visit: (): void => undefined }] })),
    mustFlag: [{ mode: proofMode, files, why: "founding defect" }],
    mustPass: [{ mode: proofMode, files, why: "nearest legal shape" }],
  } as const;
  return options.severity === "warning" ? defineGate({ ...base, severity: "warning", workItem: 1584 }) : defineGate({ ...base, severity: "error" });
}

/** The one compiler program every planner control resolves against. */
export const PROGRAM = {
  id: "tooling/tsconfig.json",
  config: "tooling/tsconfig.json",
  files: ["tooling/src/a.ts", "tooling/src/b.ts"],
  references: [],
  configPaths: ["tooling/tsconfig.json"],
} as const;

/** A resolved scope manifest over `currentPaths`, whole or file-scoped. */
export function scope(currentPaths: readonly string[], kind: PolicyScopeResolution["kind"] = "whole"): PolicyScopeResolution {
  const semanticPaths = currentPaths.map((path) => ({ path, status: "present" as const, previousPath: null }));
  return {
    request: kind === "whole" ? { kind: "whole" } : { kind: "file", paths: currentPaths },
    kind,
    label: kind,
    requestedPaths: kind === "whole" ? null : semanticPaths,
    currentPaths,
    semanticPaths: kind === "whole" ? [] : semanticPaths,
    programs: [PROGRAM],
    requestedProgramIds: kind === "whole" ? [PROGRAM.id] : [PROGRAM.id],
    ownership: semanticPaths.map((path) => ({ ...path, programIds: [PROGRAM.id], reason: "compiler-membership" as const })),
    workspacePackage: null,
    projectConfig: null,
    inventory: {
      source: "git",
      trackedCommand: ["git", "ls-files", "-z"],
      untrackedCommand: ["git", "ls-files", "--others", "-z"],
      trackedCount: 2,
      untrackedCount: 0,
      authoredCount: 2,
      mergeBase: null,
    },
  };
}

type RunRequest = Extract<PolicyCommandRequest, { readonly mode: "run" }>;

/** A file-scoped run request with every flag at its default, overridable per control. */
export function runRequest(overrides: Partial<RunRequest> = {}): RunRequest {
  return {
    mode: "run" as const,
    tier: "changed" as const,
    scope: { kind: "file" as const, paths: ["tooling/src/a.ts"] },
    selector: { kind: "all" as const },
    strictScope: false,
    failOnWarnings: false,
    json: true,
    ...overrides,
  };
}
