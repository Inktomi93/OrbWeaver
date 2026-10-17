import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Node } from "ts-morph";
import { vi } from "vitest";
import type { RawGateFinding } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate } from "../../../../tooling/src/verify/gates/query-freshness-coverage.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { isolatedTypeFacts } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { ctxFor } from "../../_support.ts";

function findings(files: Readonly<Record<string, string>>): readonly RawGateFinding[] {
  const { project, root } = ctxFor(files);
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root,
    project,
    nativeTypeFacts: () => isolatedTypeFacts(project),
    reviewedGrants: [],
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  return result.policies[0]?.findings ?? [];
}

const CONSUMER = "packages/client/src/features/x/components/x.tsx";
const SEAM = "packages/client/src/data/invalidation.ts";

test("an inert object property key does not make a dead invalidation helper reachable", () => {
  expect(
    findings({
      [SEAM]:
        "export interface Invalidation { readonly invalidate: () => void }\n" +
        "function deadHelper(trpc: Trpc) {\n  return [trpc.ghost.orphanRead.pathFilter()];\n}\n" +
        "export function createInvalidation(trpc: Trpc) {\n" +
        "  return [{ deadHelper: false }, trpc.other.thing.pathFilter()];\n}\n",
      [CONSUMER]: "export const q = trpc.ghost.orphanRead.queryOptions({});\n",
    }),
  ).toHaveLength(1);
});

test("a call to an invalidation helper makes its filters reachable", () => {
  expect(
    findings({
      [SEAM]:
        "export interface Invalidation { readonly invalidate: () => void }\n" +
        "function livingHelper(trpc: Trpc) {\n  return [trpc.ghost.livingRead.pathFilter()];\n}\n" +
        "export function createInvalidation(trpc: Trpc) {\n  return livingHelper(trpc);\n}\n",
      [CONSUMER]: "export const q = trpc.ghost.livingRead.queryOptions({});\n",
    }),
  ).toEqual([]);
});

test("query freshness retains exact declaration reach without acquiring identifier Types", () => {
  const sibling = "packages/client/src/data/invalidation-reads.ts";
  const { project, root } = ctxFor({
    [SEAM]:
      "import { rows as imported } from './invalidation-reads.ts';\n" +
      "export interface Invalidation { readonly invalidate: () => void }\n" +
      "function overloadOnly(trpc: Trpc) { return [trpc.ghost.overloadOnly.pathFilter()]; }\n" +
      "function overloaded(trpc: Parameters<typeof overloadOnly>[0]): object[];\n" +
      "function overloaded(trpc: Trpc) { return [trpc.ghost.overloadImplementation.pathFilter()]; }\n" +
      "function living(trpc: Trpc) { return [trpc.ghost.localRead.pathFilter()]; }\n" +
      "const local = living;\n" +
      "function shadowed(trpc: Trpc) { return [trpc.ghost.shadowed.pathFilter()]; }\n" +
      "export function createInvalidation(trpc: Trpc, shadowed: () => object) {\n" +
      '  return [local(trpc), imported(trpc), overloaded(trpc), shadowed(), trpc["ghost"]["bracketRead"]["pathFilter"]()];\n}\n',
    [sibling]:
      'export function rows(trpc: Trpc) { return [trpc["ghost"]["siblingRead"]["queryFilter"]()]; }\n' +
      "export function unused(trpc: Trpc) { return [trpc.ghost.orphanRead.pathFilter()]; }\n",
    [CONSUMER]:
      "export const reads = [trpc.ghost.localRead.queryOptions({}), trpc.ghost.siblingRead.queryOptions({}),\n" +
      '  trpc["ghost"]["bracketRead"]["infiniteQueryOptions"]({}), trpc.ghost.overloadOnly.queryOptions({}), trpc.ghost.overloadImplementation.queryOptions({}),\n' +
      "  trpc.ghost.shadowed.queryOptions({}), trpc.ghost.orphanRead.queryOptions({})];\n",
  });
  const policies = [gate];
  const run = (): ReturnType<typeof runPolicyPass> =>
    runPolicyPass({
      knownPolicies: policies,
      policies,
      root,
      project,
      nativeTypeFacts: () => isolatedTypeFacts(project),
      reviewedGrants: [],
      failOnWarnings: false,
    });
  const baseline = run();
  expect(baseline.toolErrors).toEqual([]);
  expect(baseline.factErrors).toEqual([]);
  expect(baseline.authority.effectiveFindings.map(({ subject }) => subject).toSorted((left, right) => String(left).localeCompare(String(right)))).toEqual([
    "ghost.orphanRead",
    "ghost.overloadImplementation",
    "ghost.shadowed",
  ]);
  const original = Node.prototype.getType;
  let reads = 0;
  const poison = vi.spyOn(Node.prototype, "getType").mockImplementation(function (this: Node) {
    const source = this.getSourceFile().getFilePath();
    if (Node.isIdentifier(this) && (source.endsWith(SEAM) || source.endsWith(sibling))) {
      reads += 1;
      throw new Error("query freshness acquired an identifier Type");
    }
    return original.call(this);
  });
  try {
    const result = run();
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.withheldPolicyIds).toEqual([]);
    expect(result.authority.effectiveFindings).toEqual(baseline.authority.effectiveFindings);
    expect(reads).toBe(0);
  } finally {
    poison.mockRestore();
  }
});

test("independent freshness grants keep exact subjects and operations for bracket reads", () => {
  const { project, root } = ctxFor({
    [SEAM]:
      "export interface Invalidation { readonly invalidate: () => void }\n" +
      "export function createInvalidation(trpc: Trpc) { return [trpc.other.thing.pathFilter()]; }\n",
    [CONSUMER]: 'export const q = trpc["settings"]["getVersion"]["queryOptions"]({});\n',
  });
  const grant = reviewedGrantsFor([gate]).find(({ subject }) => subject === "settings.getVersion");
  if (grant === undefined) {
    throw new Error("the production independent version driver grant is missing");
  }
  const run = (row: typeof grant): ReturnType<typeof runPolicyPass> =>
    runPolicyPass({
      knownPolicies: [gate],
      policies: [gate],
      root,
      project,
      nativeTypeFacts: () => isolatedTypeFacts(project),
      reviewedGrants: [row],
      failOnWarnings: false,
    });
  const licensed = run(grant);
  expect(licensed.toolErrors).toEqual([]);
  expect(licensed.factErrors).toEqual([]);
  expect(licensed.authority.effectiveFindings).toEqual([]);
  expect(licensed.authority.authorityAlarms).toEqual([]);
  expect(licensed.authority.reviewedGrantConsumption).toEqual([{ id: grant.id, count: 1 }]);
  for (const wrong of [
    { ...grant, subject: "settings.other" },
    { ...grant, operation: "other-freshness-operation" },
  ]) {
    const result = run(wrong);
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    expect(result.authority.effectiveFindings).toMatchObject([{ subject: grant.subject, token: '"getVersion"' }]);
    expect(result.authority.authorityAlarms.map(({ kind }) => kind)).toEqual(["stale-reviewed-grant"]);
  }
});
