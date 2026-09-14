import type { RawGateFinding } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate } from "../../../../tooling/src/verify/gates/query-freshness-coverage.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor } from "../../_support.ts";

function findings(files: Readonly<Record<string, string>>): readonly RawGateFinding[] {
  const { project, root } = ctxFor(files);
  return runPolicyPass({ knownPolicies: [gate], policies: [gate], root, project, reviewedGrants: [], failOnWarnings: false }).policies[0]?.findings ?? [];
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
