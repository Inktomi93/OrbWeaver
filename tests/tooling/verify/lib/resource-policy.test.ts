import { Project } from "ts-morph";
import type { GatePolicyContext, GatePolicyReceipt } from "../../../../tooling/src/verify/contract/policy.ts";
import { defineGate } from "../../../../tooling/src/verify/contract/policy.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { bindPolicyResources } from "../../../../tooling/src/verify/lib/resource-policy.ts";
import { createResourceHost } from "../../../../tooling/src/verify/ops/resource-host.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("each owner receives a receipt even when a sibling already acquired the resource", ({ scratch }) => {
  const invocation = createResourceHost({ root: scratch, overlay: { "package.json": JSON.stringify({ name: "orb", private: true }) } });
  const firstReceipts: GatePolicyReceipt[] = [];
  const secondReceipts: GatePolicyReceipt[] = [];
  const first = bindPolicyResources(invocation.host, { resourcePaths: ["package.json"], receipt: (receipt) => firstReceipts.push(receipt) });
  const second = bindPolicyResources(invocation.host, { resourcePaths: ["package.json"], receipt: (receipt) => secondReceipts.push(receipt) });
  expect(first.packageMetadata("root")).toBe(second.packageMetadata("root"));
  first.packageMetadata("root");
  expect(firstReceipts).toEqual([{ kind: "resource", source: "package:root", resources: 1, unresolved: 0 }]);
  expect(secondReceipts).toEqual(firstReceipts);
  expect(invocation.receipts()).toHaveLength(1);
});

test("ignored missing, empty, and unresolved resources withhold owner grant reconciliation in the real dispatcher", ({ scratch }) => {
  const cases = [undefined, "", "{broken", JSON.stringify({ name: "orb", private: true })];
  for (const content of cases) {
    const gate = defineGate({
      id: "resource-owner",
      family: "resource-owner",
      authority: "reviewed-grant",
      severity: "error",
      analysis: "resource",
      execution: "entire-population",
      population: { of: "none", why: "package resource only" },
      message: "fixture resource owner",
      create: (context: GatePolicyContext) => {
        const resources = context.resources;
        return {
          evaluate: () => {
            resources.packageMetadata("root");
          },
        };
      },
      mustFlag: [{ mode: "resource", files: { "package.json": "{}" }, why: "required metadata absent" }],
      mustPass: [{ mode: "resource", files: { "package.json": "{}" }, why: "resource-only fixture mode" }],
    });
    const result = runPolicyPass({
      policies: [gate],
      root: scratch,
      project: new Project({ useInMemoryFileSystem: true }),
      resourcePathsByPolicy: new Map([[gate.id, ["package.json"]]]),
      ...(content === undefined ? {} : { resourceOptions: { overlay: { "package.json": content } } }),
      failOnWarnings: false,
      reviewedGrants: [{ id: "fixture-grant", policyId: gate.id, subject: "package.json", operation: "read", why: "fixture grant", endsWhen: "fixture ends" }],
    });
    const ready = content === cases[3];
    expect(result.policies[0]?.owner.status).toBe(ready ? "success" : "incomplete");
    expect(result.authority.withheldPolicyIds).toEqual(ready ? [] : [gate.id]);
    expect(result.authority.authorityAlarms.map((alarm) => alarm.kind)).toEqual(ready ? ["stale-reviewed-grant"] : []);
    expect(result.policies[0]?.receipts).toMatchObject([{ source: "package:root", unresolved: ready ? 0 : 1 }]);
  }
});

test("a policy cannot consume a ready resource outside its effective resource population", ({ scratch }) => {
  const { host } = createResourceHost({ root: scratch, overlay: { "packages/ui/package.json": JSON.stringify({ name: "@orb/ui", private: true }) } });
  const receipts: GatePolicyReceipt[] = [];
  const resources = bindPolicyResources(host, { resourcePaths: ["package.json"], receipt: (receipt) => receipts.push(receipt) });
  expect(() => resources.packageMetadata("ui")).toThrow(/outside the effective resource population/);
  expect(receipts).toMatchObject([{ source: "package:ui", unresolved: 1 }]);
});
