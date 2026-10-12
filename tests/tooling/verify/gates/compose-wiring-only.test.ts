import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/compose-wiring-only.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const ROOT = "/compose-wiring-only";
const SUBJECT = "packages/server/src/entry/compose/x.ts";
const OP = 'export function build(load: (id: string) => string) {\n  MARKER\n  return { read: (id: string) => (id.length > 0 ? load(id) : "") };\n}\n';

function drive(source: string): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  project.createSourceFile(`${ROOT}/${SUBJECT}`, source);
  const result = runPolicyPass({ knownPolicies: [gate], policies: [gate], project, root: ROOT, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  return result;
}

test("every declared row holds through production conformance", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("the baseline waiver binds at the reported op name and nowhere else", () => {
  const raw = drive(OP.replace("MARKER", ""));
  expect(raw.authority.effectiveFindings.map((finding) => finding.token)).toEqual(["read"]);

  const waived = drive(OP.replace("MARKER", "// @orb-waive compose-wiring-only(read): baselined; burn-down item 964."));
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);

  const deadPosition = drive(OP.replace("MARKER", "// @orb-waive compose-wiring-only(load): baselined; burn-down item 964."));
  expect(deadPosition.authority.waivedFindings).toEqual([]);
  expect(deadPosition.authority.effectiveFindings).toHaveLength(1);
  expect(deadPosition.authority.authorityAlarms.length).toBeGreaterThan(0);
});
