import { Project } from "ts-morph";
import { PRODUCT_STYLESHEETS } from "../../../../tooling/src/verify/contract/css-family.ts";
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
  const declarations = [{ kind: "package-metadata", id: "root" }] as const;
  const first = bindPolicyResources({
    host: invocation.host,
    context: { resourcePaths: ["package.json"], receipt: (receipt) => firstReceipts.push(receipt) },
    declarations,
  });
  const second = bindPolicyResources({
    host: invocation.host,
    context: { resourcePaths: ["package.json"], receipt: (receipt) => secondReceipts.push(receipt) },
    declarations,
  });
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
      resources: [{ kind: "package-metadata", id: "root" }],
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
      knownPolicies: [gate],
      policies: [gate],
      root: scratch,
      project: new Project({ useInMemoryFileSystem: true }),
      ...(content === undefined ? {} : { resourceOptions: { overlay: { "package.json": content } } }),
      failOnWarnings: false,
      reviewedGrants: [{ id: "fixture-grant", policyId: gate.id, subject: "package.json", operation: "read", why: "fixture grant", endsWhen: "fixture ends" }],
    });
    const ready = content === cases[3];
    expect(result.policies[0]?.owner.status).toBe(ready ? "success" : "incomplete");
    expect(result.authority.withheldPolicyIds).toEqual(ready ? [] : [gate.id]);
    expect(result.authority.authorityAlarms.map((alarm) => alarm.kind)).toEqual(ready ? ["stale-reviewed-grant"] : []);
    expect(result.policies[0]?.receipts).toMatchObject(ready ? [{ source: "package:root", unresolved: 0 }] : []);
    expect(result.toolErrors).toMatchObject(
      ready ? [] : [{ phase: "population", message: expect.stringMatching(/resource declaration.*(missing|empty|unresolved)/i) }],
    );
  }
});

test("a policy cannot consume a ready resource outside its effective resource population", ({ scratch }) => {
  const { host } = createResourceHost({ root: scratch, overlay: { "packages/ui/package.json": JSON.stringify({ name: "@orb/ui", private: true }) } });
  const receipts: GatePolicyReceipt[] = [];
  const resources = bindPolicyResources({
    host,
    context: { resourcePaths: ["package.json"], receipt: (receipt) => receipts.push(receipt) },
    declarations: [{ kind: "package-metadata", id: "ui" }],
  });
  expect(() => resources.packageMetadata("ui")).toThrow(/outside the effective resource population/);
  expect(receipts).toMatchObject([{ source: "package:ui", unresolved: 1 }]);
});

test("a caught undeclared request leaves the owner unresolved even when its paths overlap a declaration", ({ scratch }) => {
  const overlay = Object.fromEntries(PRODUCT_STYLESHEETS.map((path) => [path, ".fixture { color: red; }\n"]));
  const gate = defineGate({
    id: "undeclared-overlap",
    family: "undeclared-overlap",
    authority: "hard",
    severity: "error",
    analysis: "resource",
    execution: "entire-population",
    population: { of: "none", why: "CSS resources only" },
    resources: [{ kind: "authored-css" }],
    message: "undeclared overlapping request",
    create: (context: GatePolicyContext) => ({
      evaluate: () => {
        try {
          context.resources.productCss();
        } catch {
          // The receipt must remain unresolved even when policy code catches the acquisition refusal.
        }
      },
    }),
    mustFlag: [{ mode: "resource", files: overlay, why: "undeclared request identity" }],
    mustPass: [{ mode: "resource", files: overlay, why: "declared request identity" }],
  });
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: scratch,
    project: new Project({ useInMemoryFileSystem: true }),
    resourceOptions: { overlay },
    reviewedGrants: [],
    failOnWarnings: false,
  });

  expect(result.policies[0]?.owner.status).toBe("incomplete");
  expect(result.policies[0]?.receipts).toMatchObject([{ kind: "resource", unresolved: 1 }]);
  expect(result.toolErrors).toMatchObject([{ phase: "receipt", message: expect.stringMatching(/unresolved/i) }]);
});

test("overlapping declared requests must each be consumed", ({ scratch }) => {
  const overlay = Object.fromEntries(PRODUCT_STYLESHEETS.map((path) => [path, ".fixture { color: red; }\n"]));
  const gate = defineGate({
    id: "unconsumed-overlap",
    family: "unconsumed-overlap",
    authority: "hard",
    severity: "error",
    analysis: "resource",
    execution: "entire-population",
    population: { of: "none", why: "CSS resources only" },
    resources: [{ kind: "authored-css" }, { kind: "product-css" }],
    message: "every request identity is consumed",
    create: (context: GatePolicyContext) => ({ evaluate: () => void context.resources.authoredCss() }),
    mustFlag: [{ mode: "resource", files: overlay, why: "one declaration remains unconsumed" }],
    mustPass: [{ mode: "resource", files: overlay, why: "both declarations are consumed" }],
  });
  const result = runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root: scratch,
    project: new Project({ useInMemoryFileSystem: true }),
    resourceOptions: { overlay },
    reviewedGrants: [],
    failOnWarnings: false,
  });

  expect(result.policies[0]?.owner.status).toBe("incomplete");
  expect(result.toolErrors).toMatchObject([{ phase: "receipt", message: expect.stringMatching(/unconsumed.*product-css/i) }]);
});
