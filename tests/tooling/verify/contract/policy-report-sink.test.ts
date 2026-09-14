// The final reporting membrane makes the retired explicit-Finding overload unrepresentable in authored
// policies and non-callable at runtime. These two controls are the successor to finding-overload-provenance:
// one fails compilation if the public type reopens, and one drives the production dispatcher against a cast
// that attempts the old call shape so a runtime adapter cannot quietly reappear behind the type.
import { Project } from "ts-morph";
import type { GatePolicyReportSink } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function rejectedLegacyCalls(report: GatePolicyReportSink): void {
  // @ts-expect-error -- final policies report through the named node/file methods, never report(Finding).
  report({ file: "packages/client/src/x.ts", line: 1, column: 1, message: "legacy finding" });
  // @ts-expect-error -- the file identity is the first argument, never a duplicate field in details.
  report.file("packages/client/src/x.ts", { file: "packages/client/src/x.ts", line: 1, message: "legacy finding" });
}
void rejectedLegacyCalls;

const runtimeProbe = defineGate({
  id: "policy-report-sink-runtime-probe",
  family: "policy-report-sink-runtime-probe",
  authority: "hard",
  severity: "error",
  population: { in: ["@client"] },
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: "runtime probe",
  create: (ctx) => ({
    evaluate: () => {
      Reflect.apply(ctx.report as unknown as (...args: readonly unknown[]) => unknown, undefined, [
        { file: "packages/client/src/x.ts", line: 1, column: 1, message: "legacy finding" },
      ]);
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/x.ts": "export const x = 1;\n" },
      expect: { count: 1 },
      why: "not run as a declared proof; the production pass below owns the deliberate runtime refusal",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/x.ts": "export const x = 1;\n" },
      why: "not run as a declared proof; the production pass below owns the deliberate runtime refusal",
    },
  ],
});

test("the production dispatcher exposes no callable legacy report adapter", () => {
  const root = "/policy-report-sink-runtime";
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${root}/packages/client/src/x.ts`, "export const x = 1;\n");
  const result = runPolicyPass({
    knownPolicies: [runtimeProbe],
    policies: [runtimeProbe],
    root,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
  });

  expect(result.toolErrors).toMatchObject([
    {
      policyId: runtimeProbe.id,
      phase: "evaluate",
      message: expect.stringContaining("not a function"),
    },
  ]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies).toMatchObject([{ owner: { status: "incomplete", population: "incomplete" } }]);
  expect(result.authority.withheldPolicyIds).toEqual([runtimeProbe.id]);
});
