// Replay every original second-wave example. A retired marker remains an observed original-byte
// difference; its exact modern waiver is a separate successor, not a replacement of the old fixture.
import type { GateDescriptor } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as memberCardClamped } from "../../../../tooling/src/verify/gates/member-card-clamped.ts";
import { gate as testDeterminism } from "../../../../tooling/src/verify/gates/test-determinism.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import type { Files } from "../../../support/legacy-differential.ts";
import { createDifferential, frozenLegacyGate, legacyScenarios, sorted } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const BASE = "99b7429e2b0377aa5a6ae62341f9a22aa40de94c";
const PATHS = ["tooling/src/verify/gates/member-card-clamped.ts", "tooling/src/verify/gates/test-determinism.ts"] as const;
const COMPANION = "tests/server/differential-companion.test.ts";
const MARKERS = new Map([
  ["tests/server/marked.test.ts", "performance.now"],
  ["tests/server/marked-hrtime.test.ts", "process.hrtime"],
]);
const differential = createDifferential("/simple-visitors-wave-2", (owner, phase, message) => {
  throw new Error(`${owner}/${phase}: ${message}`);
});
function assertComplete(result: PolicyPassResult, policy: GatePolicy, paths: readonly string[], waived = 0): void {
  expect(result.policies.map(({ id }) => id)).toEqual([policy.id]);
  expect(result.policies[0]?.owner).toEqual({ status: "success", population: "complete" });
  expect(result.policies[0]?.population).toEqual({
    declaredSourcePaths: sorted(paths),
    effectiveSourcePaths: sorted(paths),
    declaredResourcePaths: [],
    effectiveResourcePaths: [],
    requestedPaths: null,
  });
  expect(result.facts).toEqual([]);
  expect(result.factErrors).toEqual([]);
  expect(result.toolErrors).toEqual([]);
  expect(result.waiverCarrierRefusals).toEqual([]);
  expect(result.authority.toolErrors).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.authority.grantedFindings).toEqual([]);
  expect(result.authority.reviewedGrantConsumption).toEqual([]);
  expect(result.authority.waivedFindings).toHaveLength(waived);
  expect(result.authority.ordinaryConsumption.map(({ count }) => count)).toEqual(waived === 0 ? [] : [1]);
  expect(result.policies[0]?.findings).toHaveLength(result.authority.effectiveFindings.length + waived);
  expect(result.authority.verdict).toEqual({
    errors: result.authority.effectiveFindings.length,
    warnings: 0,
    blocking: result.authority.effectiveFindings.length,
    failOnWarnings: false,
  });
}

function findings(result: PolicyPassResult, fallback: string): readonly string[] {
  return sorted(result.authority.effectiveFindings.map((finding) => `${finding.file}:${finding.line}:${finding.message ?? fallback}`));
}

test("the converted second-wave policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs([memberCardClamped, testDeterminism])).toEqual([]);
});

function assertOriginalRow(
  legacy: GateDescriptor,
  policy: GatePolicy,
  index: number,
  { files, seenMarkers }: { readonly files: Files; readonly seenMarkers: string[] },
): void {
  const admitted = sorted(Object.keys(files).filter((file) => legacy.scanRoot?.(file) ?? true));
  const before = differential.legacyReplay(legacy, files, ({ file, line, message }) => `${file}:${line}:${message}`);
  expect(before.toolErrors).toEqual([]);
  expect(before.population).toBe(admitted.length);
  expect(before.findings).toHaveLength(index < legacy.mustFlag.length ? 1 : 0);
  const assertExcludedOriginal = (): void => {
    // The raw exclusion-only example is measured first, never silently replaced by a completed twin.
    expect(Object.keys(files)).toEqual([index === legacy.mustFlag.length + 3 ? "tests/support/clock.test.ts" : "tests/e2e/flow.test.ts"]);
    const refused = differential.finalPass([policy], files);
    expect(refused.policies).toHaveLength(1);
    expect(refused.policies[0]).toMatchObject({
      id: policy.id,
      owner: { status: "incomplete", population: "incomplete", reason: expect.stringContaining("expression admitted zero paths") },
      population: { declaredSourcePaths: [], effectiveSourcePaths: [], declaredResourcePaths: [], effectiveResourcePaths: [], requestedPaths: null },
      findings: [],
    });
    expect(refused.facts).toEqual([]);
    expect(refused.factErrors).toEqual([]);
    expect(refused.toolErrors).toEqual([{ policyId: policy.id, phase: "population", message: expect.stringContaining("expression admitted zero paths") }]);
    expect(refused.authority.withheldPolicyIds).toEqual([policy.id]);
    expect(refused.authority.toolErrors).toEqual([
      { kind: "owner-incomplete", policyId: policy.id, message: expect.stringContaining("expression admitted zero paths") },
    ]);
    expect(refused.authority.effectiveFindings).toEqual([]);
    expect(refused.authority.waivedFindings).toEqual([]);
    expect(refused.authority.grantedFindings).toEqual([]);
    expect(refused.authority.authorityAlarms).toEqual([]);
    // Finding counts stay zero; the owner and tool-error receipts above establish refusal.
    expect(refused.authority.verdict).toEqual({ errors: 0, warnings: 0, blocking: 0, failOnWarnings: false });
    const twin = { ...files, [COMPANION]: "export const t = clock.now();\n" };
    expect(differential.legacyReplay(legacy, twin, ({ file, line, message }) => `${file}:${line}:${message}`)).toEqual({ ...before, population: 1 });
    const after = differential.finalPass([policy], twin);
    assertComplete(after, policy, [COMPANION]);
    expect(findings(after, policy.message)).toEqual(before.findings);
  };
  const assertAdmittedOriginal = (): void => {
    const after = differential.finalPass([policy], files);
    assertComplete(after, policy, admitted);
    const marker = Object.entries(files).find(([file]) => MARKERS.has(file));
    const assertMarkerMove = (entry: readonly [string, string]): void => {
      const [file, original] = entry;
      const position = MARKERS.get(file);
      expect(position).toBeDefined();
      seenMarkers.push(file);
      // Vocabulary move: the old marker suppressed legacy, but is inert for the final ordinary owner.
      expect(before.findings).toEqual([]);
      expect(after.authority.effectiveFindings).toHaveLength(1);
      expect(after.authority.effectiveFindings[0]).toMatchObject({ file, line: 2, token: position });
      const oldMarker = "@orb-gate-ignore test-determinism:";
      expect(original.split(oldMarker)).toHaveLength(2);
      const successorSource = original.replace(oldMarker, `@orb-waive test-determinism(${position}):`);
      const successor = { ...files, [file]: successorSource };
      // The new marker is a CHANGED vocabulary, not an inert completion: legacy now reports the call.
      const oldSuccessor = differential.legacyReplay(legacy, successor, ({ file: at, line, message }) => `${at}:${line}:${message}`);
      expect(oldSuccessor).toEqual({ findings: findings(after, policy.message), population: 1, toolErrors: [] });
      const modern = differential.finalPass([policy], successor);
      assertComplete(modern, policy, [file], 1);
      expect(modern.authority.effectiveFindings).toEqual([]);
      expect(modern.authority.waivedFindings[0]?.finding).toMatchObject({ file, line: 2, token: position });
      const wrong = differential.finalPass([policy], { ...successor, [file]: successorSource.replace(`(${position})`, "(wrong-position)") });
      expect(wrong.policies[0]?.owner).toEqual({ status: "success", population: "complete" });
      expect(wrong.toolErrors).toEqual([]);
      expect(wrong.factErrors).toEqual([]);
      expect(wrong.authority.toolErrors).toEqual([]);
      expect(wrong.authority.withheldPolicyIds).toEqual([]);
      expect(wrong.authority.waivedFindings).toEqual([]);
      expect(wrong.authority.effectiveFindings).toHaveLength(1);
      expect(wrong.authority.authorityAlarms).toHaveLength(1);
      expect(wrong.authority.authorityAlarms[0]).toMatchObject({
        kind: "ordinary-waiver",
        policyId: policy.id,
        message: expect.stringContaining("names a dead position"),
        waiverId: `${file}:1:1`,
      });
    };
    const assertUnchanged = (): void => {
      expect(findings(after, policy.message)).toEqual(before.findings);
      // Only the member-card legacy descriptor authored token identities. The determinism conversion
      // added exact-slice tokens; its two positional successors above prove that new identity door.
      const oldTokens = differential.legacyReplay(legacy, files, ({ token }) => token ?? "");
      const carriedTokens = after.authority.effectiveFindings.map(({ token }) => (policy.id === "member-card-clamped" ? (token ?? "") : ""));
      expect(sorted(carriedTokens)).toEqual(oldTokens.findings);
    };
    if (marker === undefined) {
      assertUnchanged();
    } else {
      assertMarkerMove(marker);
    }
  };
  (admitted.length === 0 ? assertExcludedOriginal : assertAdmittedOriginal)();
}

test("every original second-wave row retains findings and population, including retired markers and excluded-only inputs", async ({ scratch }) => {
  const seenMarkers: string[] = [];
  let replayed = 0;
  for (const [path, policy] of [
    [PATHS[0], memberCardClamped],
    [PATHS[1], testDeterminism],
  ] as const) {
    const legacy = await frozenLegacyGate(scratch, BASE, path);
    for (const [index, files] of legacyScenarios(legacy, "packages/ui/src/x.ts").entries()) {
      assertOriginalRow(legacy, policy, index, { files, seenMarkers });
      replayed += 1;
    }
  }
  expect(replayed).toBe(24);
  expect(sorted(seenMarkers)).toEqual(sorted([...MARKERS.keys()]));
});

test("determinism retains the admitted positive while both exempt tiers remain outside its population", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, BASE, PATHS[1]);
  const inside = "tests/server/positive.test.ts";
  const files = {
    // @orb-waive test-determinism(Date.now): authored input to the determinism detector, never executed
    [inside]: "export const t = Date.now();\n",
    // @orb-waive test-determinism(Date.now): excluded-tier fixture for the detector, never executed
    "tests/support/outside.test.ts": "export const t = Date.now();\n",
    // @orb-waive test-determinism(Date.now): excluded-tier fixture for the detector, never executed
    "tests/e2e/outside.test.ts": "export const t = Date.now();\n",
  };
  const before = differential.legacyReplay(legacy, files, ({ file, line, message }) => `${file}:${line}:${message}`);
  expect(before.population).toBe(1);
  expect(before.toolErrors).toEqual([]);
  expect(before.findings).toHaveLength(1);
  const after = differential.finalPass([testDeterminism], files);
  assertComplete(after, testDeterminism, [inside]);
  expect(findings(after, testDeterminism.message)).toEqual(before.findings);
});
