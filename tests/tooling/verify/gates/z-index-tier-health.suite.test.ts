import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/z-index-tier-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";

const ROOT = "/z-home-health";
const CLIENT = { "packages/client/src/x.ts": "export const x = 1;" };
const LAYOUT = { "packages/ui/src/layout/x.ts": "export const l = 1;" };
const MARKDOWN = { "packages/ui/src/markdown/x.ts": "export const m = 1;" };

function pass(files: Readonly<Record<string, string>>, requestedPaths?: readonly string[]): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: ROOT,
    project,
    reviewedGrants: [],
    failOnWarnings: false,
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
  });
}

test("both homes stay healthy without a token resource or special anchor", () => {
  const result = pass({ ...LAYOUT, ...MARKDOWN });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
});

test("each missing home is independently reported from the complete admitted files", () => {
  for (const [files, missing] of [
    [LAYOUT, "packages/ui/src/markdown/"],
    [MARKDOWN, "packages/ui/src/layout/"],
  ] as const) {
    const result = pass(files);
    expect(result.toolErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toMatchObject([{ message: expect.stringContaining(missing) }]);
  }
  expect(pass(CLIENT).authority.effectiveFindings).toHaveLength(2);
});

test("a narrowed request still defers this whole-population owner", () => {
  const result = pass({ ...CLIENT, ...LAYOUT, ...MARKDOWN }, ["packages/client/src/x.ts"]);
  expect(result.policies[0]?.owner).toMatchObject({ status: "not-applicable", population: "complete" });
});

test("an empty admitted population is withheld rather than falsely reporting two missing homes", () => {
  const result = pass({ "packages/server/src/x.ts": "export const x = 1;" });
  expect(result.toolErrors).toMatchObject([{ policyId: gate.id, phase: "population", message: expect.stringContaining("admitted zero paths") }]);
  expect(result.policies[0]?.owner.status).toBe("incomplete");
  expect(result.authority.withheldPolicyIds).toEqual([gate.id]);
  expect(result.authority.effectiveFindings).toEqual([]);
  expect(result.policies.flatMap(({ findings }) => findings)).toEqual([]);
});

test("the same empty-population control with one admitted file reaches an actual missing-home verdict", () => {
  const result = pass({ "packages/server/src/x.ts": "export const x = 1;", ...CLIENT });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.policies[0]?.owner.status).toBe("success");
  expect(result.authority.effectiveFindings).toHaveLength(2);
});
