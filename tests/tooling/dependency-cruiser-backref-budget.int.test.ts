// Backreference selectors in .dependency-cruiser.cjs denote a different set per matched file, so no static reader
// can test them. The committed count is the only control on that population: equality, so growth and an
// uncommitted shrink both fail.
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { readConfigSnapshot } from "../../tooling/src/verify/lib/config-snapshot.ts";
import { scaledBudget } from "./_load-budget.ts";

const CONFIG_REL = ".dependency-cruiser.cjs";
const BACKREF_RE = /\$\d/u;
// The helper-world rule adds one paired capture so same-world edges pass and upward edges stay refused.
// The package-subpath-crossing rule adds one paired capture: a `#src/` import is legal only inside the importer's own module.
const BACKREF_BUDGET = 15;

function backrefCount(selectors: readonly { readonly value: string }[]): number {
  return selectors.filter((selector) => BACKREF_RE.test(selector.value)).length;
}

test("the counter ignores ordinary selectors and counts every capture backreference", () => {
  expect(backrefCount([{ value: "^packages/server/" }, { value: String.raw`^packages/kit/src/live\.ts$` }])).toBe(0);
  expect(backrefCount([{ value: "^packages/server/" }, { value: "^packages/p0/([^/]+)/$1/" }, { value: "^a/$2/" }])).toBe(2);
});

test("the root dependency-cruiser config carries exactly the committed backreference count", { timeout: scaledBudget(120_000) }, ({ repoRoot }) => {
  const read = readConfigSnapshot(repoRoot, "depcruise", CONFIG_REL);
  expect(read.kind, read.kind === "ok" ? "" : read.detail).toBe("ok");
  const selectors = read.kind === "ok" ? read.snapshot.selectors : [];
  // A zero-length read would make any count agree with nothing; the real config derives well over 80 selectors.
  expect(selectors.length).toBeGreaterThan(80);
  expect(backrefCount(selectors)).toBe(BACKREF_BUDGET);
});
