import type { GatePolicy } from "@orb/tooling/verify";
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
    create:
      options.create ?? ((): ReturnType<GatePolicy["create"]> => ({ visitors: [{ kinds: [SyntaxKind.VariableDeclaration], visit: (): void => undefined }] })),
    mustFlag: [{ mode: proofMode, files, why: "founding defect" }],
    mustPass: [{ mode: proofMode, files, why: "nearest legal shape" }],
  } as const;
  return options.severity === "warning" ? defineGate({ ...base, severity: "warning", workItem: 1584 }) : defineGate({ ...base, severity: "error" });
}
