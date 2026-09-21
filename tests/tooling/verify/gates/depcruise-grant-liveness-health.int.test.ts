// The PERMANENT PIN for `depcruise-grant-liveness-health` — the arm that could not report itself (#2485).
// Its declared `mustFlag`/`mustPass` rows run through `verifyPolicyProofs` in the family conformance test
// (`grant-liveness-family.suite.test.ts`); what THIS file keeps is what an isolated resource fixture cannot
// show:
//   1. THE ARM ACTUALLY PRINTS, through the production dispatcher, with NO authority tool error. That is the
//      whole defect: while the budget lived inside the `reviewed-grant` sibling it emitted a finding with no
//      `(subject, operation)`, so every drift became `⚠ authority [invalid-reviewed-grant-identity]`, the
//      message never reached a reader, the run exited 2, and the sibling's OTHER findings were withheld
//      behind a diagnostic that named nothing. Both policies are driven together here, so the pin covers the
//      collateral half as well.
//   2. THE COUNT IS THE SAME SET the sibling used to hand it. The arm counts backreference rows over ALL
//      root-authored selectors; inside the sibling it counted only the ones the file-exact classifier
//      SKIPPED. A policy may not import a sibling gate, so the equivalence is proven HERE, against the REAL
//      `.dependency-cruiser.cjs`, using the sibling's exported `classifyRegex`.
// The central wrong-identity/duplicate/stale controls are NOT copied here: `tests/tooling/verify/lib/
// gate-authority.test.ts` owns them ("invalid coordinates, not-applicable findings, blank identities…"),
// which is the control proving this fix came from moving the arm to an authority that admits it, never from
// weakening the check the arm used to trip.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { Project } from "ts-morph";
import { PACKAGE_RESOURCE_PATHS } from "../../../../tooling/src/verify/contract/resource-config.ts";
import { classifyRegex, gate as sibling } from "../../../../tooling/src/verify/gates/depcruise-grant-liveness.ts";
import { gate } from "../../../../tooling/src/verify/gates/depcruise-grant-liveness-health.ts";
import { readConfigSnapshot } from "../../../../tooling/src/verify/lib/config-snapshot.ts";
import { irreducibleBudgetFindings } from "../../../../tooling/src/verify/lib/grant-liveness.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const CONFIG_REL = ".dependency-cruiser.cjs";
const BUDGET_ANCHOR = "docs/architecture/core/Core-Enforcement-Active-Gates.md";
const BACKREF_RE = /\$\d/u;

/** The sibling's declared `package-metadata` subjects, SPELLED OUT because `policy-fixture-substrate`
 *  refuses a write whose destination it cannot enumerate statically, and `PACKAGE_RESOURCE_PATHS` is a
 *  frozen spread of a computed record (`lib/fixture-path-authored-record.ts`: "record values are not
 *  statically enumerable"). The roster is not duplicated in effect: the first arm below asserts this list
 *  IS that record's values, so a package added to the workspace reds here by name instead of rotting. */
const PACKAGE_MANIFESTS = [
  "package.json",
  "packages/kit/package.json",
  "packages/contracts/package.json",
  "packages/db/package.json",
  "packages/inference/package.json",
  "packages/server/package.json",
  "packages/default-content/package.json",
  "packages/showcase-plugins/package.json",
  "packages/ui/package.json",
  "packages/client/package.json",
  "tooling/package.json",
] as const;

/** A scratch repository carrying `count` backreference rows plus one ordinary prefix, the real-tree anchor,
 *  and a git index (the `tracked-files` resource reads `git ls-files`, never the filesystem). */
function plantRepo(root: string, count: number): void {
  // One LIVE file-exact row alongside the backreferences: the sibling is driven on this same tree, and an
  // anchor-sized config deriving zero exact rows is its blindness tripwire, which REFUSES the run. The
  // collateral claim below is about a completed sibling, so the fixture must not trip it.
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
  // The SIBLING declares every package manifest, and population resolution refuses a non-ready declared
  // resource before `create` runs — so driving the two together owes all of them, or the collateral half of
  // this arm would be measured against a tool error of its own making.
  for (const rel of PACKAGE_MANIFESTS) {
    mkdirSync(join(root, dirname(rel)), { recursive: true });
    writeFileSync(join(root, rel), '{ "name": "fixture", "private": true }\n');
  }
  execFixtureGit(root, ["init", "-q"]);
  execFixtureGit(root, ["add", "-A"]);
}

function drive(root: string): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: [gate, sibling],
    policies: [gate, sibling],
    root,
    project: new Project({ useInMemoryFileSystem: true }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("the irreducible BUDGET is two-sided — growth AND an uncommitted shrink both RED", () => {
  // Carried verbatim from `depcruise-grant-liveness.int.test.ts` with the arm (#2485): the comparison is an
  // EQUALITY, so a one-sided ratchet that only watched growth would leave an unreviewed shrink in place.
  const message = "actual {actual} budget {budget}";
  expect(irreducibleBudgetFindings(CONFIG_REL, 15, 15, message)).toEqual([]);
  expect(irreducibleBudgetFindings(CONFIG_REL, 16, 15, message)[0]?.message).toBe("actual 16 budget 15");
  expect(irreducibleBudgetFindings(CONFIG_REL, 14, 15, message)[0]?.message).toBe("actual 14 budget 15");
});

// The native dependency-cruiser loader runs in a niced child per read, so both arms carry a load-scaled
// budget rather than sitting one contention spike away from vitest's 5s default.
test("the BUDGET arm prints its own message, with no authority tool error and no withheld sibling", { timeout: scaledBudget(120_000) }, ({ scratch }) => {
  // One MORE backreference row than the committed budget: the growth direction, on a tree that carries the
  // real-tree anchor the arm requires.
  // The manifest roster this fixture plants IS the sibling's declared subject set — asserted rather than
  // assumed, so a new workspace package reds here by name instead of surfacing as a mystery tool error.
  expect([...PACKAGE_MANIFESTS].sort()).toEqual(Object.values(PACKAGE_RESOURCE_PATHS).sort());
  plantRepo(scratch, 99);
  const result = drive(scratch);

  expect(result.toolErrors).toEqual([]);
  expect(result.authority.authorityAlarms).toEqual([]);
  const messages = result.authority.effectiveFindings.map((finding) => finding.message ?? "");
  expect(messages.some((message) => message.includes("IRREDUCIBLE `$1`-backreference patterns"))).toBe(true);
  expect(messages.some((message) => message.includes("is 99, but the committed budget is 14"))).toBe(true);
  // The collateral half: the reviewed-grant sibling completes rather than being withheld behind the
  // diagnostic the identity-less finding used to raise.
  expect(result.authority.withheldPolicyIds).toEqual([]);
  expect(result.policies.map(({ id, owner }) => [id, owner.status])).toContainEqual(["depcruise-grant-liveness", "success"]);
});

test("the REAL config's backreference count is the sibling's skipped-row count, and equals the committed budget", { timeout: scaledBudget(120_000) }, ({
  repoRoot,
}) => {
  const read = readConfigSnapshot(repoRoot, "depcruise", CONFIG_REL);
  expect(read.kind, read.kind === "ok" ? "" : read.detail).toBe("ok");
  const selectors = read.kind === "ok" ? read.snapshot.selectors : [];
  // A planted positive control on the reader itself: a zero-length selector set would make both counts
  // agree at zero and say nothing at all.
  expect(selectors.length).toBeGreaterThan(80);

  const overAll = selectors.filter((selector) => BACKREF_RE.test(selector.value));
  // The set the arm used to be handed: rows the FILE-EXACT classifier could not resolve. A `$` is a regex
  // metacharacter, so a backreference can never classify as exact — the two sets must be identical, and if
  // that ever stops holding the arm has silently changed population.
  const overSkipped = overAll.filter((selector) => classifyRegex(selector.value) === undefined);
  expect(overSkipped).toEqual(overAll);
  // The real-tree receipt for the committed number, re-derived rather than trusted.
  expect(overAll).toHaveLength(14);
});
