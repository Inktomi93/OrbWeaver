// The widened role-authority population must detect entry and room-effect ceilings on the actual compiler graph.
import type { RealCorpusLivenessArm } from "@orb/testkit/node/real-corpus-liveness.ts";
import { assertArmVerdict, openRealCorpusLiveness } from "@orb/testkit/node/real-corpus-liveness.ts";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { loadGateCorpus, reviewedGrantsFor, runPolicyPass } from "@orb/tooling/verify";
import { gate as role } from "../../../../tooling/src/verify/gates/two-class-role-authority.ts";
import { nativeTypeFactOptions, projectCtx } from "../../../../tooling/src/verify/lib/project-context.ts";
import { WAIVER_BUDGET } from "../../../../tooling/src/verify/lib/waiver-budget.ts";
import { ALL_ARMS } from "./_liveness/runner.ts";

const ROLE_PATHS = [
  "packages/server/src/entry/compose/liveness-identity-role.ts",
  "packages/server/src/domain/plugin/verbs/liveness-identity-role.ts",
] as const;
const ROLE_SOURCE =
  'import type { ParticipantRole } from "@orb/contracts/identity"; export function ceiling(role: ParticipantRole) { return { canWrite: role === "host" }; }\n';
const ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: role,
    overlays: [
      { kind: "add", path: ROLE_PATHS[0], source: ROLE_SOURCE },
      { kind: "add", path: ROLE_PATHS[1], source: ROLE_SOURCE },
    ],
    messageIncludes: "liveness-identity-role.ts",
  },
];

test("the complete current role-authority population is clean with its existing sanctioned-module grants", async ({ repoRoot }) => {
  const policies = [role];
  const corpus = await loadGateCorpus(repoRoot);
  const context = projectCtx(repoRoot);
  const result = runPolicyPass({
    knownPolicies: corpus.gates,
    policies,
    root: repoRoot,
    project: context.project,
    ...nativeTypeFactOptions(context),
    reviewedGrants: reviewedGrantsFor(policies),
    waiverBudget: WAIVER_BUDGET,
    failOnWarnings: false,
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.authority.toolErrors).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(result.authority.effectiveFindings).toEqual([]);
  for (const measured of result.policies) {
    expect(measured.population.effectiveSourcePaths).toEqual(measured.population.declaredSourcePaths);
    expect(measured.population.effectiveSourcePaths).toContain("packages/server/src/entry/boot/seed-owner.ts");
    expect(measured.population.effectiveSourcePaths).toContain("packages/server/src/entry/boot/boot-secrets.ts");
    expect(measured.population.effectiveSourcePaths).toContain("packages/server/src/entry/compose/automation-plugin.ts");
  }
  expect(result.authority.reviewedGrantConsumption.every((grant) => grant.count === 1)).toBe(true);
});

test("actual entry compose and domain authority fields remain in the role-authority gate", ({ repoRoot }) => {
  const ids = new Set(ARMS.map((arm) => arm.policy.id));
  const runner = openRealCorpusLiveness(repoRoot, ARMS, [...ALL_ARMS.filter((arm) => !ids.has(arm.policy.id)), ...ARMS]);
  for (const arm of ARMS) {
    const messages = assertArmVerdict(arm, runner.verdict(arm));
    expect(messages).toHaveLength(arm.overlays.length);
    for (const overlay of arm.overlays) {
      if (overlay.kind !== "add") {
        throw new Error("identity liveness only adds virtual controls");
      }
      expect(messages.join("\n")).toContain(overlay.path);
    }
  }
});
