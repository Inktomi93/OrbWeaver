import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/root-development-dependencies.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

test("the root dependency policy rejects runtime dependencies and permits development dependencies", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test("missing, empty and malformed root manifests withhold the dependency verdict", ({ scratch }) => {
  const cases = [
    [{}, "missing"],
    [{ "package.json": "" }, "empty"],
    [{ "package.json": '{"name":' }, "unresolved"],
    [{ "package.json": '{"name":"orbweaver","dependencies":{"tsx":["x"]}}' }, "unresolved"],
  ] as const;
  for (const [overlay, status] of cases) {
    const result = runPolicyPass({
      knownPolicies: [gate],
      policies: [gate],
      root: scratch,
      project: new Project({ skipAddingFilesFromTsConfig: true }),
      resourceOptions: { overlay },
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.authority.effectiveFindings, status).toEqual([]);
    expect(result.authority.withheldPolicyIds, status).toEqual([gate.id]);
    expect(result.toolErrors, status).toMatchObject([
      { policyId: gate.id, phase: "population", message: expect.stringContaining(`package-metadata:root is ${status}`) },
    ]);
    expect(
      result.policies.map(({ owner }) => owner.status),
      status,
    ).toEqual(["incomplete"]);
  }
});

test("root runtime dependencies cannot hide behind absent verification scripts", ({ scratch }) => {
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: scratch,
    project: new Project({ skipAddingFilesFromTsConfig: true }),
    resourceOptions: { overlay: { "package.json": '{"name":"orbweaver","dependencies":{"fixture-runtime-dep":"1"}}' } },
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.authority.effectiveFindings).toMatchObject([{ policyId: gate.id, message: expect.stringContaining("Dependency: fixture-runtime-dep.") }]);
  expect(result.policies.map(({ receipts }) => receipts)).toEqual([[{ kind: "resource", source: "package:root", resources: 1, unresolved: 0 }]]);
});
