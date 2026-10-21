// The owner rows must resolve without advisory unknowns; an unreadable positive is not recognized ownership.
// @subject tooling/src/verify/lib/caught-failure-collection.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project, SyntaxKind, ts } from "ts-morph";
import { vi } from "vitest";
import { withinClosureBound } from "../../../../tooling/src/floor/code-facts/bounded-closure.ts";
import { gate } from "../../../../tooling/src/verify/gates/caught-failure-ownership.ts";
import { promiseAbsorberSite } from "../../../../tooling/src/verify/lib/caught-failure.ts";
import { nativeFailureRead } from "../../../../tooling/src/verify/lib/caught-failure-native.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { policyProofRows } from "../../../../tooling/src/verify/lib/policy-proof-rows.ts";
import { isolatedTypeFacts, verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/owners";
const rows = policyProofRows(gate).filter(({ proof }) => ["1199 ", "1126 "].some((prefix) => proof.why.startsWith(prefix)));

test("all declared caught-failure regressions retain their exact finding and authority expectations", {
  timeout: scaledBudget(policyProofRows(gate).length * 1000),
}, () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

test.each(rows)("$proof.why", ({ proof, arm }) => {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true, target: ts.ScriptTarget.ES2022 } });
  for (const [path, text] of Object.entries(proof.files)) {
    project.createSourceFile(`${ROOT}/${path}`, text);
  }
  const result = runPolicyPass({
    root: ROOT,
    project,
    policies: [gate],
    knownPolicies: [gate],
    reviewedGrants: [],
    failOnWarnings: false,
    nativeTypeFacts: () => isolatedTypeFacts(project),
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.policies[0]?.analysis?.unknown ?? []).toEqual([]);
  const findings = result.authority.effectiveFindings;
  const expectedCount = arm === "mustFlag" ? proof.expect?.count : 0;
  if (expectedCount === undefined) {
    throw new Error("a mustFlag owner row has no expected finding count");
  }
  expect(findings).toHaveLength(expectedCount);
  expect(findings.map(({ token }) => token)).toEqual(findings.map(() => proof.expect?.token));
});

test("computed lifetime links replay captured native answers without borrowing a live checker", () => {
  const proof = gate.mustPass.find(({ why }) => why === "1199 lifetime all settled retained promise disposal");
  const text = Object.values(proof?.files ?? {})[0];
  if (text === undefined) {
    throw new Error("the retained allSettled lifetime fixture is absent");
  }
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true, target: ts.ScriptTarget.ES2022 } });
  const source = project.createSourceFile(
    `${ROOT}/packages/server/src/probe/computed-lifetime.ts`,
    text.replaceAll(".allSettled(", "['allSettled'](").replaceAll(".filter(", "['filter'](").replaceAll(".map(", "['map'](").replaceAll(".add(", "['add']("),
  );
  using facts = isolatedTypeFacts(project);
  const owner = "computed-lifetime-replay";
  const calls = source.getDescendantsOfKind(SyntaxKind.CallExpression);
  const native = nativeFailureRead(
    {
      files: [source],
      nativeTypes: {
        request: (query) => facts.request(owner, query),
        invocationEvidence: (nodes, plan) => facts.invocationEvidence(owner, nodes, plan),
        references: (nodes, importer) => facts.references(owner, nodes, importer),
      },
    },
    () => calls,
  );
  native.prepare();
  facts.seal(new Set([owner]));
  const reads = native.at(source);
  const absorber = calls.find((call) => call.getExpression().getText() === "stopped.catch");
  if (absorber === undefined) {
    throw new Error("the retained rejection site is absent");
  }
  const spies = source
    .getDescendantsOfKind(SyntaxKind.StringLiteral)
    .filter((node) => ["allSettled", "filter", "map", "add"].includes(node.getLiteralValue()))
    .map((node) =>
      vi.spyOn(node, "getType").mockImplementation(() => {
        throw new Error("live checker escaped native lifetime replay");
      }),
    );
  try {
    expect(spies).toHaveLength(4);
    expect(withinClosureBound(() => promiseAbsorberSite(absorber, reads))).toEqual({ kind: "resolved", value: undefined });
    expect(spies.some((spy) => spy.mock.calls.length > 0)).toBe(false);
  } finally {
    for (const spy of spies) {
      spy.mockRestore();
    }
  }
});
