// Integration proof for #954, migrated to the final `defineGate` contract (#1917). Exact candidates come
// from AST/declaration provenance first; Oxide only tokenizes those candidates. The founding shapes, the
// cross-file re-export report site, and the fail-closed unresolved-cycle arm are proven by the policy's own
// `mustFlag`/`mustPass` rows through `verifyPolicyProofs` (see `tests/tooling/static-class-consumers.int.test.ts`).
// This file keeps only what those isolated fixtures cannot show: that a multi-file real run with an
// unresolved static cycle still completes (the per-occurrence finding is the receipt — see the gate's own
// "NOT a ctx.receipt()" note), and that `execution: "entire-population"` defers under a narrowed scope —
// the generic deferral mechanics are the planner's own contract, proven for every shape at
// `tests/tooling/verify/lib/policy-plan.test.ts`; this pins it for this one real policy.
import { ModuleKind, ModuleResolutionKind, Project, ScriptKind } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/no-tailwind-dark-variant.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/repo";

function projectFor(files: Readonly<Record<string, string>>): Project {
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { module: ModuleKind.NodeNext, moduleResolution: ModuleResolutionKind.NodeNext, jsx: 4 },
  });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, text, { scriptKind: path.endsWith(".tsx") ? ScriptKind.TSX : ScriptKind.TS });
  }
  return project;
}

test("a multi-file real run with a runtime prefix and an unresolved static cycle completes and reports both", () => {
  const project = projectFor({
    "packages/ui/src/x.tsx": `
      declare const tone: string;
      const A = B;
      const B = A;
      export const X = <div className={\`dark:\${tone}\`} />;
      export const Y = <div className={A} />;
    `,
  });
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  const owner = result.policies.find((policy) => policy.id === gate.id);
  expect(owner?.owner.status).toBe("success");
  expect(owner?.findings).toHaveLength(2);
  expect(owner?.findings.some((finding) => finding.token === "dark:")).toBe(true);
  expect(owner?.findings.some((finding) => (finding.message ?? "").includes("unresolved:"))).toBe(true);
});

test("a narrowed request defers the entire-population policy instead of running it partially", () => {
  const project = projectFor({
    "packages/ui/src/producer.ts": 'export const CARD = "dark:bg-card";\n',
    "packages/client/src/consumer.tsx": 'import { CARD } from "../../ui/src/producer.ts";\nexport const X = <div className={CARD} />;\n',
  });
  for (const requestedPaths of [["packages/ui/src/producer.ts"], ["packages/client/src/consumer.tsx"]]) {
    const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], root: ROOT, project, requestedPaths, reviewedGrants: [], failOnWarnings: false });
    expect(result.toolErrors).toEqual([]);
    const owner = result.policies.find((policy) => policy.id === gate.id);
    expect(owner?.owner).toMatchObject({ status: "not-applicable", population: "complete" });
    expect(owner?.findings).toEqual([]);
  }
});
