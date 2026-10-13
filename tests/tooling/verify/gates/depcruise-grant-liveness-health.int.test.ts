// Budget equality and native selector observation retain the governed backreference claim.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/depcruise-grant-liveness-health.ts";
import { readConfigSnapshot } from "../../../../tooling/src/verify/lib/config-snapshot.ts";
import { irreducibleBudgetFindings } from "../../../../tooling/src/verify/lib/grant-liveness.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CONFIG_REL = ".dependency-cruiser.cjs";
const BUDGET_ANCHOR = "docs/law/Core-Enforcement-Active-Gates.md";
const BACKREF_RE = /\$\d/u;

/** A scratch repository carrying `count` backreference rows plus one ordinary prefix, the real-tree anchor,
 *  and a git index (the `tracked-files` resource reads `git ls-files`, never the filesystem). */
function plantRepo(root: string, count: number): void {
  const rows = [
    '"^packages/server/"',
    String.raw`"^packages/kit/src/live\\.ts$"`,
    ...Array.from({ length: count }, (_, i) => `"^packages/p${String(i)}/([^/]+)/$1/"`),
  ];
  mkdirSync(join(root, "packages/kit/src"), { recursive: true });
  writeFileSync(join(root, "packages/kit/src/live.ts"), "export const live = 1;\n");
  writeFileSync(join(root, CONFIG_REL), `module.exports = { forbidden: [{ name: "r", from: { path: [${rows.join(", ")}] }, to: {} }] };\n`);
  mkdirSync(join(root, dirname(BUDGET_ANCHOR)), { recursive: true });
  writeFileSync(join(root, BUDGET_ANCHOR), "# Core-Enforcement-Active-Gates\n");
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
}

function drive(root: string): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: [gate],
    policies: [gate],
    root,
    project: new Project({ useInMemoryFileSystem: true }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("the irreducible BUDGET is two-sided — growth AND an uncommitted shrink both RED", () => {
  // Equality also rejects an unreviewed shrink; a growth-only comparison would miss it.
  const message = "actual {actual} budget {budget}";
  expect(irreducibleBudgetFindings(CONFIG_REL, 15, 15, message)).toEqual([]);
  expect(irreducibleBudgetFindings(CONFIG_REL, 16, 15, message)[0]?.message).toBe("actual 16 budget 15");
  expect(irreducibleBudgetFindings(CONFIG_REL, 14, 15, message)[0]?.message).toBe("actual 14 budget 15");
});

// The native dependency-cruiser loader runs in a niced child per read, so both arms carry a load-scaled
// budget rather than sitting one contention spike away from vitest's 5s default.
test("budget drift reports through hard authority without withholding its owner", { timeout: scaledBudget(120_000) }, ({ scratch }) => {
  // One MORE backreference row than the committed budget: the growth direction, on a tree that carries the
  // real-tree anchor the arm requires.
  plantRepo(scratch, 99);
  const result = drive(scratch);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
  const messages = result.authority.effectiveFindings.map((finding) => finding.message ?? "");
  expect(messages.some((message) => message.includes("IRREDUCIBLE `$1`-backreference patterns"))).toBe(true);
  expect(messages.some((message) => message.includes("is 99, but the committed budget is 14"))).toBe(true);
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.policies.map(({ id, owner }) => [id, owner.status])).toEqual([[gate.id, "success"]]);
});

test("the native root configuration retains the committed backreference budget", { timeout: scaledBudget(120_000) }, ({ repoRoot }) => {
  const read = readConfigSnapshot(repoRoot, "depcruise", CONFIG_REL);
  expect(read.kind, read.kind === "ok" ? "" : read.detail).toBe("ok");
  const selectors = read.kind === "ok" ? read.snapshot.selectors : [];
  // A planted positive control on the reader itself: a zero-length selector set would make both counts
  // agree at zero and say nothing at all.
  expect(selectors.length).toBeGreaterThan(80);

  const overAll = selectors.filter((selector) => BACKREF_RE.test(selector.value));
  // The real-tree receipt for the committed number, re-derived rather than trusted.
  expect(overAll).toHaveLength(14);
});

test("the backreference budget preserves its growth, shrink and anchor controls", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});
