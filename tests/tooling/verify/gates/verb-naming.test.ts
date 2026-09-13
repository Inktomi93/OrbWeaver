// Replay the frozen server hooks without concealing the original barrel-only population refusal.
import type { GateDescriptor } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as typesInContract } from "../../../../tooling/src/verify/gates/types-in-contract.ts";
import { gate as verbNaming } from "../../../../tooling/src/verify/gates/verb-naming.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import type { Files } from "../../../support/legacy-differential.ts";
import { createDifferential, frozenLegacyGate, legacyScenarios, sorted } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const BASE = "e656ce65d4a01510dae7d7c42fd25d825738caa6";
const PATHS = ["tooling/src/verify/gates/types-in-contract.ts", "tooling/src/verify/gates/verb-naming.ts"] as const;
const VERB = "packages/server/src/domain/chat/verbs/start-chat.ts";
const BARREL = "packages/server/src/domain/chat/verbs/index.ts";
const differential = createDifferential("/server-file-hooks", (owner, phase, message) => {
  throw new Error(`${owner}/${phase}: ${message}`);
});
function assertComplete(result: PolicyPassResult, policy: GatePolicy, paths: readonly string[]): void {
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
  expect(result.authority.waivedFindings).toEqual([]);
  expect(result.authority.ordinaryConsumption).toEqual([]);
  expect(result.policies[0]?.findings).toHaveLength(result.authority.effectiveFindings.length);
  expect(result.authority.verdict).toEqual({
    errors: result.authority.effectiveFindings.length,
    warnings: 0,
    blocking: result.authority.effectiveFindings.length,
    failOnWarnings: false,
  });
}

function findings(result: PolicyPassResult, fallback: string): readonly string[] {
  return sorted(result.authority.effectiveFindings.map((finding) => `${finding.file}:${finding.message ?? fallback}`));
}

test("the converted server file-hook policies pass the final production proof runtime", () => {
  expect(verifyPolicyProofs([typesInContract, verbNaming])).toEqual([]);
});

function assertOriginalRow(legacy: GateDescriptor, policy: GatePolicy, index: number, files: Files): void {
  const admitted = sorted(Object.keys(files).filter((file) => legacy.scanRoot?.(file) ?? true));
  const before = differential.legacyReplay(legacy, files, ({ file, message }) => `${file}:${message}`);
  expect(before.toolErrors).toEqual([]);
  expect(before.population).toBe(admitted.length);
  expect(before.findings).toHaveLength(index < legacy.mustFlag.length ? 1 : 0);
  const assertBarrelOriginal = (): void => {
    // Legacy base === "index" already acquitted this row. The carve moved to population algebra.
    expect(admitted).toEqual([BARREL]);
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
    const twin = { ...files, [VERB]: "export const createStartChat = () => undefined;\n" };
    expect(differential.legacyReplay(legacy, twin, ({ file, message }) => `${file}:${message}`)).toEqual({ ...before, population: 2 });
    const after = differential.finalPass([policy], twin);
    assertComplete(after, policy, [VERB]);
    expect(findings(after, policy.message)).toEqual(before.findings);
  };
  const assertAdmittedOriginal = (): void => {
    const after = differential.finalPass([policy], files);
    assertComplete(after, policy, admitted);
    expect(findings(after, policy.message)).toEqual(before.findings);
    // Both legacy hooks reported line zero; the final hooks anchor the same catch on line one.
    expect(after.authority.effectiveFindings.map(({ line }) => line)).toEqual(index < legacy.mustFlag.length ? [1] : []);
  };
  (policy.id === "verb-naming" && Object.keys(files).every((file) => file === BARREL) ? assertBarrelOriginal : assertAdmittedOriginal)();
}

test("every original server-hook row retains its findings and classified population before neutral completion", async ({ scratch }) => {
  let replayed = 0;
  for (const [path, policy] of [
    [PATHS[0], typesInContract],
    [PATHS[1], verbNaming],
  ] as const) {
    const legacy = await frozenLegacyGate(scratch, BASE, path);
    for (const [index, files] of legacyScenarios(legacy, VERB).entries()) {
      assertOriginalRow(legacy, policy, index, files);
      replayed += 1;
    }
  }
  expect(replayed).toBe(9);
});

test.each([
  ["a type-only expected-name export", "export type createStartChat = () => void;\n", 1],
  ["a non-callable expected-name constant", "export const createStartChat = 1;\n", 1],
  ["a callable annotation over a non-callable initializer", "export const createStartChat: () => void = 1 as never;\n", 1],
  ["an exported function declaration", "export function createStartChat() { return () => undefined; }\n", 0],
  ["an exported arrow function", "export const createStartChat = () => () => undefined;\n", 0],
  [
    "an exported alias of a callable runtime value",
    "function buildStartChat() { return () => undefined; }\nexport const createStartChat = buildStartChat;\n",
    0,
  ],
] as const)("verb naming preserves %s", (_label, source, expectedFindings) => {
  const result = differential.finalPass([verbNaming], { [VERB]: source });
  assertComplete(result, verbNaming, [VERB]);
  expect(result.authority.effectiveFindings).toHaveLength(expectedFindings);
});

test("the service-contract population keeps the positive service file and rejects its ordinary-module twin", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, BASE, PATHS[0]);
  const inside = "packages/server/src/domain/hub/contract/service.ts";
  const outside = "packages/server/src/domain/hub/service.ts";
  const files = { [inside]: "export const noInterface = 1;\n", [outside]: "export const noInterface = 1;\n" };
  const before = differential.legacyReplay(legacy, files, ({ file, message }) => `${file}:${message}`);
  expect(before).toEqual({ findings: [`${inside}:${typesInContract.message}`], population: 1, toolErrors: [] });
  const after = differential.finalPass([typesInContract], files);
  assertComplete(after, typesInContract, [inside]);
  expect(findings(after, typesInContract.message)).toEqual(before.findings);
});
