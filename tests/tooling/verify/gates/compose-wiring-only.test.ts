import type { RealCorpusLivenessArm } from "@orb/testkit/node/real-corpus-liveness.ts";
import { assertArmVerdict, openRealCorpusLiveness } from "@orb/testkit/node/real-corpus-liveness.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/compose-wiring-only.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { ALL_ARMS } from "./_liveness/runner.ts";

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

test("the real canonical mint is admitted while a reached admission helper beside it remains detectable", { timeout: 120_000 }, ({ repoRoot }) => {
  const bridge = "return async (userId: UserId): Promise<Principal> => principalFromRow(userId, await sessions.loadUserById(userId));";
  const arm: RealCorpusLivenessArm = {
    policy: gate,
    reportsAt: ["packages/server/src/entry/auth/seam.ts"],
    overlays: [
      {
        kind: "edit",
        path: "packages/server/src/entry/auth/seam.ts",
        replace: [
          bridge,
          "function composeAdmission(fields: UserPrincipalFields | null): boolean { return fields?.enabled === true; }\n  return async (userId: UserId): Promise<Principal> => { const fields = await sessions.loadUserById(userId); composeAdmission(fields); return principalFromRow(userId, fields); };",
        ],
      },
    ],
    messageIncludes: "=== true",
  };
  const runner = openRealCorpusLiveness(repoRoot, [arm], [...ALL_ARMS.filter((known) => known.policy.id !== gate.id), arm]);
  expect(runner.assertBaseline()).toEqual([gate.id]);
  expect(assertArmVerdict(arm, runner.verdict(arm))).toHaveLength(1);
});
