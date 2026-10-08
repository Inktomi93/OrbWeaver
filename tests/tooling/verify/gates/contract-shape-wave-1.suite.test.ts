import { Project } from "ts-morph";
import { getWorkspace } from "../../../../tooling/src/_shared/ts-workspace.ts";
import type { ReviewedGateGrant } from "../../../../tooling/src/verify/contract/gate-authority.ts";
import { gate as contractDerivesNotRespells } from "../../../../tooling/src/verify/gates/contract-derives-not-respells.ts";
import { gate as injectedOpCallerParam } from "../../../../tooling/src/verify/gates/injected-op-caller-param.ts";
import { gate as injectedOpCallerParamHealth } from "../../../../tooling/src/verify/gates/injected-op-caller-param-health.ts";
import { gate as serdeCoreSeal } from "../../../../tooling/src/verify/gates/serde-core-seal.ts";
import { gate as serdeCoreSealHealth } from "../../../../tooling/src/verify/gates/serde-core-seal-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { reviewedGrantsFor } from "../../../../tooling/src/verify/lib/reviewed-grants.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// The first defineGate-only wave of the "bus/contract-shape family" (#1584 gate-runtime-standardization):
// three legacy modules, each split into an ordinary occurrence policy plus a hard, entire-population
// stale-exemption health policy sharing its family. None of the three shared a reader with each other or
// with any sibling gate at conversion time — each is its own two-member family, not a merge candidate.
//
// TWO OF THE THREE ARE STILL PAIRS. `contract-derives-not-respells` is NOT: its ALLOWLIST became central
// reviewed grants and `contract-derives-not-respells-health` retired with the table it audited (#2176 Phase F,
// 2026-09-15). The health policy's whole subject was "this exemption row names nothing any more", which the
// central engine now owns as `stale-reviewed-grant` after a complete owner run — so the successor evidence is
// the REAL-CORPUS grant reconciliation below, not another declared row. The third successor obligation (an
// ungranted hand-row on the real corpus IS an effective finding) is the policy's real-corpus liveness arm in
// `_liveness/runner.ts`, which collects the censusable arm data for native corpus partitions.
const FAMILY_TIMEOUT_MS = scaledBudget(120_000);

test(
  "the contract-derives-not-respells singleton proves ARM A/B occurrence and its reviewed-grant identity witness",
  () => {
    expect(verifyPolicyProofs([contractDerivesNotRespells])).toEqual([]);
  },
  FAMILY_TIMEOUT_MS,
);

/** The policy's whole declared population. NARROWING IT MANUFACTURES A VERDICT: drop `@contracts` and ARM A
 *  can never fire, drop `@db` and every hand-row silently stops matching a table — the run would then read
 *  "clean" for a reason that has nothing to do with the tree. */
const CORPUS_GLOBS = ["packages/server/src/**/*.ts", "packages/contracts/src/**/*.ts", "packages/db/src/**/*.ts"];

test(
  "on the real corpus no contract projection grant remains, and the retired stats subject reds as stale",
  ({ repoRoot }) => {
    const policies = [contractDerivesNotRespells];
    const project = getWorkspace({ root: repoRoot, globs: CORPUS_GLOBS.map((glob) => `${repoRoot}/${glob}`) });
    const grants = reviewedGrantsFor(policies);
    // No projection permission survives the canonical wire-home migration.
    expect(grants).toEqual([]);

    const run = (reviewedGrants: readonly ReviewedGateGrant[]): ReturnType<typeof runPolicyPass> =>
      runPolicyPass({ knownPolicies: policies, policies, root: repoRoot, project, reviewedGrants, failOnWarnings: false });

    const exact = run(grants);
    expect(exact.toolErrors).toEqual([]);
    expect(exact.factErrors).toEqual([]);
    expect(exact.authority.toolErrors).toEqual([]);
    expect(exact.authority.withheldPolicyIds).toEqual([]);
    // Complete real evidence must be clean without projection permission.
    expect(exact.authority.effectiveFindings).toEqual([]);
    expect(exact.authority.grantedFindings).toHaveLength(grants.length);
    expect(exact.authority.reviewedGrantConsumption).toEqual(grants.map(({ id }) => ({ id, count: 1 })));
    // SCOPED TO THIS POLICY'S AUTHORITY. §6.2: a partial `knownPolicies` roster manufactures alarms — the
    // real corpus carries `@orb-waive` markers for ~300 policies this one-policy run never loaded, and each
    // is an `ordinary-waiver` "unknown policy" alarm about somebody else. The grant kinds are the verdict.
    expect(exact.authority.authorityAlarms.filter((alarm) => alarm.kind !== "ordinary-waiver")).toEqual([]);

    const retiredGrant = {
      id: "contract-derives-not-respells:stats-model-stat-row",
      policyId: contractDerivesNotRespells.id,
      subject: "packages/server/src/domain/stats/contract/views.ts::ModelStatRow",
      operation: "contract-hand-row:modelStats",
      why: "A retired server projection cannot consume permission after its canonical wire-home migration.",
      endsWhen: "The subject no longer declares a hand-written row.",
    } satisfies ReviewedGateGrant;
    const stale = run([retiredGrant]);
    expect(stale.toolErrors).toEqual([]);
    expect(stale.authority.toolErrors).toEqual([]);
    expect(stale.authority.grantedFindings).toEqual([]);
    expect(stale.authority.effectiveFindings).toEqual([]);
    expect(
      stale.authority.authorityAlarms
        .filter((alarm) => alarm.kind !== "ordinary-waiver")
        .map((alarm) => `${alarm.kind} ${"grantId" in alarm ? alarm.grantId : ""}`),
    ).toEqual([`stale-reviewed-grant ${retiredGrant.id}`]);
  },
  FAMILY_TIMEOUT_MS,
);

/** mustFlag[0]'s fixture plus the exact `@orb-waive` line that SUPPRESSED it while the policy was
 *  `ordinary`. It was a mustPASS row until #2176 Phase F; under `reviewed-grant` the marker is inert. It
 *  cannot go back to being a declared row — the central engine now raises an authority ALARM for a marker
 *  aimed at a non-ordinary policy, and §6.2 puts an expected alarm in a family test, never in a proof row. */
const CLOSED_MARKER_FIXTURE: Readonly<Record<string, string>> = {
  "packages/contracts/src/chat/roster.ts": "export interface RosterMemberSpec {\n  readonly kind: string;\n}\n",
  "packages/server/src/domain/chat/contract/params.ts":
    "// @orb-waive contract-derives-not-respells(RosterMemberSpec): a marker is not a door on this policy.\n" +
    "export interface RosterMemberSpec {\n  readonly kind: string;\n}\n",
};

test("the retired ordinary marker door is CLOSED: the waiver is inert and the engine calls it out", () => {
  const root = "/contract-derives-closed-marker";
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(CLOSED_MARKER_FIXTURE)) {
    project.createSourceFile(`${root}/${path}`, source);
  }
  const policies = [contractDerivesNotRespells];
  const result = runPolicyPass({ knownPolicies: policies, policies, root, project, reviewedGrants: [], failOnWarnings: false });
  expect(result.toolErrors).toEqual([]);
  // The finding SURVIVES the marker. Green here would mean the authority regressed to ordinary and every
  // homonym became mintable line-locally, one line above the shape, by whoever wrote the shape.
  expect(result.authority.effectiveFindings.map((finding) => finding.token)).toEqual(["RosterMemberSpec"]);
  expect(result.authority.waivedFindings).toEqual([]);
  expect(result.authority.authorityAlarms.map((alarm) => alarm.message)).toEqual([
    `ordinary waiver at packages/server/src/domain/chat/contract/params.ts:1:1 targets non-ordinary policy ${contractDerivesNotRespells.id}`,
  ]);
});

test(
  "the serde-core-seal family proves the importer seal and the sanctioned-domain staleness ratchet",
  () => {
    expect(verifyPolicyProofs([serdeCoreSeal, serdeCoreSealHealth])).toEqual([]);
  },
  FAMILY_TIMEOUT_MS,
);

test(
  "the injected-op-caller-param family proves the caller-param occurrence check, CALLER_FREE_OPS staleness, and the entity-id blindness tripwire",
  () => {
    expect(verifyPolicyProofs([injectedOpCallerParam, injectedOpCallerParamHealth])).toEqual([]);
  },
  FAMILY_TIMEOUT_MS,
);
