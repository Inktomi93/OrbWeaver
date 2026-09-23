// The vendor CSS surface. Like the installed-package door, the POSITIVE arm reads the real tree on
// purpose: both halves are reached through pnpm store symlinks, and a hand-built `node_modules` would not
// reproduce the indirection that breaks a naive implementation. No committed mirror side any more (#10) —
// the refusal arm plants its control by pointing the door at a tree with no installed package at all.
import type { ResourceLoad } from "../../../../tooling/src/verify/contract/resource.ts";
import type { VendorCssSurface } from "../../../../tooling/src/verify/contract/resource-vendor.ts";
import { loadVendorCssSurface } from "../../../../tooling/src/verify/ops/resource-vendor.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/u, "");

function surface(root: string): ResourceLoad<VendorCssSurface> {
  return loadVendorCssSurface(root);
}

test("the installed declarations and the vendor bundles arrive as ONE fact", () => {
  const fact = surface(ROOT);

  expect(fact.status).toBe("ready");
  if (fact.status !== "ready") {
    throw new Error(`vendor surface refused on the real tree: ${fact.reason}`);
  }
  expect(fact.value.packageVersion).toMatch(/^\d+\.\d+\.\d+/u);
  expect(fact.value.declarationFiles.length).toBeGreaterThan(0);
  expect(fact.value.declarationFiles.every((file) => file.path.endsWith("CssVars.d.ts"))).toBe(true);
  // The bundle set is discovered, never pinned to one hash-named chunk: a chunk name is a build artifact,
  // and a gate pinned to one goes silently blind at the next upgrade.
  expect(fact.value.selectorSources.length).toBeGreaterThan(1);
  expect(fact.value.selectorSources.some((file) => file.text.includes("data-streamdown"))).toBe(true);
  // Neither installed side publishes a repo path — this is an UNPOPULATED resource kind.
  expect(fact.paths).toEqual([]);
  expect(fact.members).toBe(fact.value.declarationFiles.length + fact.value.selectorSources.length);
});

test("an unresolvable installed package refuses and names it, rather than reporting an empty set", ({ scratch }) => {
  const fact = surface(scratch);
  expect(fact.status).not.toBe("ready");
  expect(fact.status === "ready" ? "" : fact.reason).toContain("base-ui");
});
