import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, SyntaxKind } from "ts-morph";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { renderPolicyPass } from "../../../../tooling/src/verify/lib/render.ts";
import { analysisCoverageText } from "../../../../tooling/src/verify/lib/show-policy.ts";
import { gateListLines } from "../../../../tooling/src/verify/lib/show-structure-view.ts";
import { finalSide, structureCountReconciliation } from "../../../../tooling/src/verify/lib/structure-report.ts";

const ROOT = "/partial-analysis";
const PATH = "packages/server/src/read.ts";
const REASON = "predicate helper is outside direct analysis";
const ink = { bold: String, dim: String, green: String, red: String, cyan: String };

const policy = defineGate({
  id: "partial-analysis",
  family: "partial-analysis",
  authority: "hard",
  severity: "error",
  population: "@server",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: "concrete defect",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.Identifier],
        visit: (node) => {
          if (node.getText() === "supported") {
            ctx.report.analysis(node, { kind: "supported" });
          }
          if (node.getText() === "helper") {
            ctx.report.analysis(node, { kind: "unknown", reason: REASON });
          }
        },
      },
    ],
  }),
  mustFlag: [{ mode: "source", files: { [PATH]: "export const helper = 1;" }, why: "the importing test owns advisory semantics" }],
  mustPass: [{ mode: "source", files: { [PATH]: "export const supported = 1;" }, why: "the importing test owns coverage semantics" }],
});

test("anchored analysis gaps survive artifacts and both CLI views without becoming warnings or blockers", () => {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${ROOT}/${PATH}`, "export const supported = 1;\nexport const helper = 2;\n");
  const result = runPolicyPass({ root: ROOT, project, policies: [policy], knownPolicies: [policy], reviewedGrants: [], failOnWarnings: true });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.verdict).toMatchObject({ errors: 0, warnings: 0, blocking: 0, failOnWarnings: true });
  expect(result.authority.withheldPolicyIds).toEqual([]);
  const final = finalSide([policy], result);
  if (final.report === null) {
    throw new Error("the selected policy has no report");
  }
  expect(final.rows[0]?.analysis).toEqual({ supported: 1, unknown: [{ file: PATH, line: 2, column: 14, token: "helper", reason: REASON }] });
  const console = renderPolicyPass(final.rows, final.report, [policy]);
  expect(console).toContain(analysisCoverageText({ supported: 1, unknown: [{ file: PATH, line: 2, column: 14, token: "helper", reason: REASON }] }));
  expect(console).toContain(`${PATH}:2:14`);
  expect(console).toContain(REASON);
  const report = { gates: final.rows, policy: final.report, total: 0, ok: true, reconciliation: structureCountReconciliation(final.rows, final.report) };
  const shown = gateListLines(report, { errorsOnly: false, gate: null, file: null, limit: 10 }, false, ink).join("\n");
  expect(shown).toContain("UNKNOWN");
  expect(shown).toContain(`${PATH}:2:14`);
  expect(shown).toContain(REASON);
});
