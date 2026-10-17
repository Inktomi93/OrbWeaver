import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate } from "../../../../tooling/src/verify/gates/macro-resolution-home.ts";
import { MACRO_RESOLVERS } from "../../../../tooling/src/verify/lib/macro-resolution-fact.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { ctxFor } from "../../_support.ts";

function run(names: readonly string[]): ReturnType<typeof runPolicyPass> {
  const { project, root } = ctxFor({
    "packages/kit/src/macro/example.ts": names.map((name) => `export function ${name}() {}`).join("\n"),
    "packages/client/src/example.ts": "export const unrelated = true;",
  });
  return runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false });
}

test("each missing macro resolver withholds the home consumer instead of disappearing from its vocabulary", () => {
  for (const missing of MACRO_RESOLVERS) {
    const result = run(MACRO_RESOLVERS.filter((name) => name !== missing));
    expect(result.factErrors.map(({ message }) => message)).toEqual([expect.stringContaining(`macro resolver declarations disappeared: ${missing}`)]);
    expect(result.authority.withheldPolicyIds).toEqual([gate.id]);
    expect(result.authority.effectiveFindings).toEqual([]);
  }
});

test("all macro declarations remain admissible without any editor use", () => {
  const result = run(MACRO_RESOLVERS);
  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});

test("macro home retains its import, call and tokenizing controls", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
