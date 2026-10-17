import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { gate } from "../../../../tooling/src/verify/gates/query-freshness-coverage.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { ctxFor } from "../../_support.ts";

const SEAM = "packages/client/src/data/invalidation.ts";
const CONSUMER = "packages/client/src/features/x/components/x.tsx";

function run(seam: string): ReturnType<typeof runPolicyPass> {
  const { project, root } = ctxFor({
    [SEAM]: seam,
    [CONSUMER]: "export const q = trpc.ghost.frozenRead.queryOptions({});\n",
  });
  return runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

for (const declaration of [
  "export interface Invalidation { readonly invalidate: () => void }",
  "export type Invalidation = { readonly invalidate: () => void };",
]) {
  test(`an anchored invalidation seam without its factory refuses: ${declaration}`, () => {
    const result = run(`${declaration}\nexport function buildInvalidation(trpc: Trpc) { return [trpc.ghost.frozenRead.pathFilter()]; }\n`);
    expect(result.factErrors.map(({ message }) => message)).toEqual([
      expect.stringContaining("Invalidation anchor is present but createInvalidation is absent"),
    ]);
    expect(result.authority.withheldPolicyIds).toEqual([gate.id]);
    expect(result.authority.effectiveFindings).toEqual([]);
  });
}

test("a readable factory keeps the uncovered query finding instead of refusing", () => {
  const result = run(
    "export interface Invalidation { readonly invalidate: () => void }\nexport function createInvalidation(trpc: Trpc) { return [trpc.other.thing.pathFilter()]; }\n",
  );
  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings.map(({ subject }) => subject)).toEqual(["ghost.frozenRead"]);
});

test("a corpus without an invalidation anchor does not invent a missing-factory failure", () => {
  const result = run("export const unrelated = true;\n");
  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
});
