// Ordinary remediation metadata is validated after JavaScript has evaluated aliases and builders.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { assertPolicyModuleExport } from "../../../../tooling/src/verify/lib/policy-module.ts";
import { assertGatePolicyDescriptor } from "../../../../tooling/src/verify/lib/policy-validation.ts";

const TRUNK = {
  id: "waiver-fix",
  family: "waiver-fix",
  authority: "ordinary",
  severity: "error",
  analysis: "syntax",
  execution: "selected-files",
  population: "@tooling",
  facts: [],
  resources: [],
  message: "fixture policy",
  create: () => ({ evaluate: (): void => undefined }),
  mustFlag: [{ mode: "source", files: { "tooling/src/proof.ts": "export const value = 1;" }, why: "founding defect" }],
  mustPass: [{ mode: "source", files: { "tooling/src/proof.ts": "export const value = 0;" }, why: "nearest legal shape" }],
} as const;

test("ordinary descriptors refuse absent and foreign waiver spelling at the actual loading boundary", () => {
  for (const fix of [
    undefined,
    "move it.",
    "waive with @orb-waive other-policy(position): reason",
    "@orb-waive waiver-fix-extra(position): reason",
    "@orb-waive-file other-policy(position): reason",
  ]) {
    const policy = fix === undefined ? TRUNK : { ...TRUNK, fix };
    expect(() => assertGatePolicyDescriptor(policy), String(fix)).toThrow(/descriptor.fix.*waiver-fix/u);
  }
  const gate = defineGate({ ...TRUNK, fix: "move it." });
  expect(() => assertPolicyModuleExport({ gate }, "tooling/src/verify/gates/waiver-fix.ts")).toThrow(/waiver-fix.ts.*descriptor.fix/u);
});

test("evaluated ordinary fixes admit both existing openers, aliases, concatenation and computed values", () => {
  const opener = "@orb-waive ";
  const fix = "waive with " + opener + "waiver-fix(position): reason";
  for (const policy of [
    { ...TRUNK, fix },
    { ...TRUNK, fix: "waive with @orb-waive-file waiver-fix(position): reason" },
    { ...TRUNK, fix: ["waive with", "@orb-waive", "waiver-fix(position): reason"].join(" ") },
  ]) {
    expect(() => assertGatePolicyDescriptor(policy)).not.toThrow();
    const gate = defineGate(policy);
    expect(assertPolicyModuleExport({ gate }, "tooling/src/verify/gates/waiver-fix.ts")).toBe(gate);
  }
  for (const authority of ["hard", "reviewed-grant"] as const) {
    const policy = {
      ...TRUNK,
      authority,
      mustFlag: [{ ...TRUNK.mustFlag[0], ...(authority === "reviewed-grant" ? { grant: { subject: "owned", operation: "read" } } : {}) }],
    };
    expect(() => assertGatePolicyDescriptor(policy)).not.toThrow();
    expect(() => assertGatePolicyDescriptor({ ...policy, fix: "move it." })).not.toThrow();
  }
});
