// Original-byte replay, including the tooling gate carve before an admitted companion is added.
import type { GateDescriptor } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import type { PolicyPassResult } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import { gate as commentedCode } from "../../../../tooling/src/verify/gates/commented-code.ts";
import { gate as toolingSize } from "../../../../tooling/src/verify/gates/tooling-size.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import type { Files } from "../../../support/legacy-differential.ts";
import { createDifferential, frozenLegacyGate, legacyScenarios, sorted } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const BASE = "0acf26cb82200e3a8290b1dd6b3c3458e36c19a6";
const PATHS = ["tooling/src/verify/gates/commented-code.ts", "tooling/src/verify/gates/tooling-size.ts"] as const;
const CONTROL = "tooling/src/verify/lib/file-hook-control.ts";
const differential = createDifferential("/simple-file-hooks", (owner, phase, message) => {
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

test("the converted file-hook policies pass their production proof runtime", () => {
  expect(verifyPolicyProofs([commentedCode, toolingSize])).toEqual([]);
});

function assertOriginalRow(legacy: GateDescriptor, policy: GatePolicy, index: number, files: Files): void {
  const admitted = sorted(Object.keys(files).filter((file) => legacy.scanRoot?.(file) ?? true));
  const before = differential.legacyReplay(legacy, files, ({ file, message }) => `${file}:${message}`);
  expect(before.toolErrors).toEqual([]);
  expect(before.population).toBe(admitted.length);
  expect(before.findings).toHaveLength(index < legacy.mustFlag.length ? 1 : 0);
  const carved = policy.id === "tooling-size" && admitted.every((file) => file.startsWith("tooling/src/verify/gates/"));
  const assertCarvedOriginal = (): void => {
    // The legacy visitor skipped this admitted gate; the final population excludes it outright.
    expect(admitted).toEqual(["tooling/src/verify/gates/long-gate.ts"]);
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
    const twin = { ...files, [CONTROL]: "export const control = true;\n" };
    const oldTwin = differential.legacyReplay(legacy, twin, ({ file, message }) => `${file}:${message}`);
    expect(oldTwin).toEqual({ ...before, population: before.population + 1 });
    const after = differential.finalPass([policy], twin);
    assertComplete(after, policy, [CONTROL]);
    expect(findings(after, policy.message)).toEqual(before.findings);
  };
  const assertAdmittedOriginal = (): void => {
    const after = differential.finalPass([policy], files);
    assertComplete(after, policy, admitted);
    expect(findings(after, policy.message)).toEqual(before.findings);
    // Legacy line zero becomes the first over-cap line; the catch and its file/message survive.
    const capLine = index === 0 ? 451 : 201;
    const findingLine = policy.id === "commented-code" ? 1 : capLine;
    expect(after.authority.effectiveFindings.map(({ line }) => line)).toEqual(index < legacy.mustFlag.length ? [findingLine] : []);
  };
  (carved ? assertCarvedOriginal : assertAdmittedOriginal)();
}

test("every original file-hook row retains its findings, population and complete verdict before any companion", async ({ scratch }) => {
  let replayed = 0;
  for (const [path, policy] of [
    [PATHS[0], commentedCode],
    [PATHS[1], toolingSize],
  ] as const) {
    const legacy = await frozenLegacyGate(scratch, BASE, path);
    for (const [index, files] of legacyScenarios(legacy, "packages/ui/src/x.ts").entries()) {
      assertOriginalRow(legacy, policy, index, files);
      replayed += 1;
    }
  }
  expect(replayed).toBe(6);
});

test("comment-looking template data no longer becomes commented code", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, BASE, PATHS[0]);
  const files = { "packages/ui/src/x/template.ts": "export const source = `\n// const rendered = true;\n`;\n" };
  const before = differential.legacyReplay(legacy, files, ({ file, message }) => `${file}:${message}`);
  expect(before).toEqual({ findings: [`packages/ui/src/x/template.ts:${commentedCode.message}`], population: 1, toolErrors: [] });
  const after = differential.finalPass([commentedCode], files);
  assertComplete(after, commentedCode, Object.keys(files));
  expect(findings(after, commentedCode.message)).toEqual([]);
});

test("file-hook population fences retain an admitted positive and exclude the authored gate", async ({ scratch }) => {
  const legacy = await frozenLegacyGate(scratch, BASE, PATHS[0]);
  const inside = "packages/ui/src/x/control.ts";
  const outside = "tooling/src/verify/gates/control.ts";
  const files = { [inside]: "// const dead = compute();\nexport const x = 1;\n", [outside]: "// const dead = compute();\nexport const x = 1;\n" };
  const before = differential.legacyReplay(legacy, files, ({ file, message }) => `${file}:${message}`);
  expect(before).toEqual({ findings: [`${inside}:${commentedCode.message}`], population: 1, toolErrors: [] });
  const after = differential.finalPass([commentedCode], files);
  assertComplete(after, commentedCode, [inside]);
  expect(findings(after, commentedCode.message)).toEqual(before.findings);
});
