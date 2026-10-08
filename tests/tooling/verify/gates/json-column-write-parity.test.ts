import { Project } from "ts-morph";
import type { GatePolicyProof } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { gate } from "../../../../tooling/src/verify/gates/json-column-write-parity.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { spellingTwinsOf } from "../../../../tooling/src/verify/lib/spelling-twins.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("the actual shorthand-writer namespace twin preserves detection and its unchanged supporting proofs", { tags: ["slow"] }, () => {
  const proofs = gate.mustFlag.filter((candidate) => candidate.why.startsWith("THE #1035 SHORTHAND RED:"));
  expect(proofs).toHaveLength(1);
  const proof = proofs[0];
  const witness = gate.mustFlag.find((candidate) => "grant" in candidate);
  if (proof === undefined || witness === undefined) {
    throw new Error("the actual founding fixture and authored grant witness must exist");
  }
  const root = "/json-column-namespace-twin";
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(proof.files)) {
    project.createSourceFile(`${root}/${path}`, source);
  }
  const baseline = runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false });
  expect(baseline.toolErrors).toEqual([]);
  expect(baseline.factErrors).toEqual([]);
  expect(baseline.authority.effectiveFindings).toHaveLength(1);
  const finding = baseline.authority.effectiveFindings[0];
  if (finding === undefined) {
    throw new Error("the reported writer must supply the respeller's focused line");
  }
  const reported = new Map([[finding.file, new Set([finding.line])]]);
  const namespace = spellingTwinsOf(proof.files, reported).namespace;
  if (namespace === undefined) {
    throw new Error("the actual namespace respelling must exist");
  }
  const detection: GatePolicyProof = { mode: proof.mode, files: namespace, why: `namespace twin of: ${proof.why}` };
  const respelled = defineGate({ ...gate, mustFlag: [detection, witness], mustPass: gate.mustPass });
  expect(verifyPolicyProofs([respelled])).toEqual([]);
});
