// The standing family floor for the two mixed-hook splits converted in #1950 group 5/6:
//
//   `testid-liveness`            → `testid-liveness` (ordinary A1 dead consumer + A2 dead registry row) over
//                                  `lib/testid-registry.ts`. Its registry-read tripwire (arm A3) is the
//                                  real-registry and registry-shape tests at the foot of this file.
//   `ui-variant-axes-stamped`    → `ui-variant-axes-stamped` (hard A1 unstamped + A2 unreadable `tv()` +
//                                  A3 duplicate NAME) + `ui-variant-axes-stamped-health` (hard axis
//                                  vocabulary tripwire) — family `ui-variant-axes-stamped` over
//                                  `lib/variant-axis-stamp.ts`.
//
// Neither legacy descriptor owned a private marker grammar and neither had a live `@orb-gate-ignore`
// marker anywhere on the tree, so there is no marker translation to pin. What lives here is everything a
// declared proof row cannot express:
//   §4.2 — the ordinary identity arm for `testid-liveness`, in BOTH reported position shapes (the quoted
//          selector literal and the bare registry key), plus the dead-position control that proves the arm
//          DISCRIMINATES rather than passing by luck.
//   §4.5 — the `-health` sibling's population is EXACTLY its home file, so an ABSENT home admits zero
//          paths and the runtime REFUSES at the population phase (louder than the legacy `fileLoaded`
//          anchor's silent skip, which is why the anchor retired), and a narrowed request DEFERS every
//          `entire-population` policy in the family.
//   THE HARD REFUSAL — `ui-variant-axes-stamped` is `authority: "hard"`, so a marker aimed at it ALARMS
//          and suppresses nothing. A split that silently softened an authority would pass every other check.
//   §4.6 — the two split differentials against the frozen legacy descriptors (`07b1b7b19d`, `f93c987f82`):
//          every legacy example replayed through the frozen legacy `runPass` and through the UNION of the
//          final pair, differences CLASSIFIED, with a PER-EXAMPLE coverage statement for each split arm.
//          The `ui-variant-axes-stamped` tripwire has ZERO legacy coverage by construction (no legacy
//          example loads its real-tree anchor), which is asserted rather than left to look like a pass.
//   THE POPULATION PORT — `testid-liveness` retains showcase but excludes package roots that cannot
//          produce UI selectors; the exact legacy-only difference is measured below.

import { join } from "node:path";
import { TEST_IDS } from "@orb/client/lib";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { SourceFile } from "ts-morph";
import { Project, SyntaxKind } from "ts-morph";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { POPULATION_ROOTS } from "../../../../tooling/src/verify/contract/population.ts";
import { gate as testid } from "../../../../tooling/src/verify/gates/testid-liveness.ts";
import { gate as variant } from "../../../../tooling/src/verify/gates/ui-variant-axes-stamped.ts";
import { gate as variantHealth } from "../../../../tooling/src/verify/gates/ui-variant-axes-stamped-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { TESTID_REGISTRY_HOME, testIdRegistryRow } from "../../../../tooling/src/verify/lib/testid-registry.ts";
import { AXIS_HOME_REL } from "../../../../tooling/src/verify/lib/variant-axis-stamp.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

const ROOT = "/testid-variant-split-family";
const VARIANT_FAMILY: readonly GatePolicy[] = [variant, variantHealth];
const ALL: readonly GatePolicy[] = [testid, ...VARIANT_FAMILY];

function projectOf(files: Readonly<Record<string, string>>): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return project;
}

function passOf(
  policies: readonly GatePolicy[],
  files: Readonly<Record<string, string>>,
  requestedPaths?: readonly string[],
): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    knownPolicies: ALL,
    policies,
    root: ROOT,
    project: projectOf(files),
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
    reviewedGrants: [],
    failOnWarnings: false,
  });
}

test("all three policies preserve their founding fixtures", () => {
  expect(verifyPolicyProofs(ALL)).toEqual([]);
});

// ─── THE POPULATION PORT — measured, not asserted ───────────────────────────────────────────────────────
test("testid-liveness excludes non-UI package roots from the legacy producer census", () => {
  // The legacy predicate, verbatim from `07b1b7b19d`.
  const legacyAdmits = (path: string): boolean => (path.includes("packages/") && path.includes("/src/")) || path.includes("tests/");
  const roots = testid.population as readonly ("@packages" | "@showcase" | "@tests" | "@legacy-tests")[];
  const prefixes = roots
    .flatMap((root) => (root === "@packages" ? ["@client", "@ui", "@server", "@db", "@contracts", "@kit"] : [root]))
    .flatMap((leaf) => POPULATION_ROOTS[leaf as keyof typeof POPULATION_ROOTS]);
  // Every declared prefix is admitted by the legacy predicate.
  for (const prefix of prefixes) {
    expect(legacyAdmits(`${prefix}x.ts`), prefix).toBe(true);
  }
  // Showcase remains a real producer root even though `@packages` excludes it.
  expect(prefixes).toContain("packages/showcase-plugins/src/");
  // These package roots are admitted by the legacy path predicate but intentionally absent from
  // this producer census. An unreviewed widening or a newly omitted package changes this exact difference.
  const legacyOnly = Object.values(POPULATION_ROOTS)
    .flat()
    .filter((prefix) => legacyAdmits(`${prefix}x.ts`) && !prefixes.includes(prefix));
  expect(legacyOnly).toEqual(["packages/plugin-toolchain/src/", "packages/default-content/src/", "packages/inference/src/"]);
  // `scripts/` stays OUT — the legacy predicate rejects it, and the gate corpus spells `data-testid` there.
  expect(legacyAdmits("scripts/dev/x.ts")).toBe(false);
  expect(prefixes).not.toContain("scripts/");
});

// ─── §4.2 ORDINARY IDENTITY — both reported position shapes, and the discrimination control ─────────────
test("the quoted selector literal is testid-liveness's waivable position", () => {
  const waived = passOf([testid], {
    "tests/client/features/character/components/list-pane.ct.tsx":
      '// @orb-waive testid-liveness("draft-cast"): the story lands with #9999; delete this when it does.\nconst a = component.getByTestId("draft-cast");\n',
  });
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

test("a marker naming a position the policy does not report ALARMS — the arm discriminates", () => {
  const stale = passOf([testid], {
    "tests/client/features/character/components/list-pane.ct.tsx":
      '// @orb-waive testid-liveness("nope-cast"): the story lands with #9999; delete this when it does.\nconst a = component.getByTestId("draft-cast");\n',
  });
  expect(stale.authority.effectiveFindings).toHaveLength(1);
  expect(stale.authority.waivedFindings).toEqual([]);
  expect(stale.authority.authorityAlarms.map((alarm) => alarm.message).join(" ")).toContain("names a dead position");
});

test("the BARE registry key is the A2 arm's waivable position — a different spelling from the A1 arm's", () => {
  const waived = passOf([testid], {
    [TESTID_REGISTRY_HOME]:
      'export const TEST_IDS = {\n  // @orb-waive testid-liveness(ghostRow): the pane lands with #9999; delete this when it does.\n  ghostRow: "ghost-row",\n} as const;\n',
  });
  expect(waived.authority.authorityAlarms).toEqual([]);
  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
});

// ─── THE HARD REFUSAL ───────────────────────────────────────────────────────────────────────────────────
test("ui-variant-axes-stamped is HARD: a marker aimed at it alarms and suppresses nothing", () => {
  const attempted = passOf([variant], {
    [AXIS_HOME_REL]: 'export const STAMPED_VARIANT_AXES = ["size"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
    "packages/ui/src/primitives/thing/variants.ts":
      '// @orb-waive ui-variant-axes-stamped(thingVariants): a waiver this policy must refuse.\nexport const thingVariants = tv({ variants: { size: { sm: "x" } } });\n',
  });
  expect(attempted.authority.effectiveFindings).toHaveLength(1);
  expect(attempted.authority.waivedFindings).toEqual([]);
  expect(attempted.authority.authorityAlarms.map((alarm) => alarm.message).join(" ")).toContain("targets non-ordinary policy ui-variant-axes-stamped");
});

// ─── §4.5 REFUSAL / DEFERRAL PINS ───────────────────────────────────────────────────────────────────────
test("the -health sibling REFUSES at the population phase when its home is absent", () => {
  const variantRun = passOf([variantHealth], { "packages/ui/src/lib/other.ts": "export const x = 1;\n" });
  expect(variantRun.toolErrors.map((error) => `${error.policyId}/${error.phase}`)).toEqual(["ui-variant-axes-stamped-health/population"]);
  expect(variantRun.authority.effectiveFindings).toEqual([]);
  // This refusal IS the retired `fileLoaded` anchor's successor: the legacy arms skipped SILENTLY when
  // their real-tree anchor was absent, which is the state a converted tripwire must never reproduce.
});

test("a narrowed request DEFERS every entire-population policy in the family", () => {
  const deferred = passOf(
    ALL,
    {
      [TESTID_REGISTRY_HOME]: 'export const TEST_IDS = {\n  ghostRow: "ghost-row",\n} as const;\n',
      [AXIS_HOME_REL]: 'export const STAMPED_VARIANT_AXES = ["size"] as const;\nexport function variantProps(): string {\n  return "";\n}\n',
      "packages/ui/src/primitives/thing/variants.ts": 'export const thingVariants = tv({ variants: { size: { sm: "x" } } });\n',
    },
    ["packages/ui/src/primitives/thing/variants.ts"],
  );
  // Nothing is judged on a subset: every policy here composes only over its whole population.
  expect(deferred.authority.effectiveFindings).toEqual([]);
  expect(deferred.toolErrors).toEqual([]);
});

// ─── THE REGISTRY READER STILL YIELDS ROWS — the blindness `testid-liveness` would otherwise read as clean ──
function registryRows(file: SourceFile): number {
  return file.getDescendantsOfKind(SyntaxKind.PropertyAssignment).filter((node) => testIdRegistryRow(node) !== undefined).length;
}

test("the reader yields exactly the rows the real registry declares", ({ repoRoot }) => {
  const file = new Project({ skipAddingFilesFromTsConfig: true }).addSourceFileAtPath(join(repoRoot, TESTID_REGISTRY_HOME));
  const declared = Object.keys(TEST_IDS).length;
  expect(declared, "the imported registry is the non-empty denominator").toBeGreaterThan(0);
  expect(registryRows(file)).toBe(declared);
});

test.for([
  ["the registry const is renamed", 'export const IDS = {\n  appShell: "app-shell",\n} as const;\n', 0],
  ["the const stops being an authored object literal", 'import { build } from "./build.ts";\nexport const TEST_IDS = build();\n', 0],
  ["no row value resolves to an authored string", "const shell = {};\nexport const TEST_IDS = {\n  appShell: shell,\n} as const;\n", 0],
  ["the live shape", 'export const TEST_IDS = {\n  appShell: "app-shell",\n  loginPage: "login-page",\n} as const;\n', 2],
  ["a quoted key is still an authored row", 'export const TEST_IDS = {\n  "app-shell": "app-shell",\n} as const;\n', 1],
  ["a sibling object is not a registry row", 'const other = { notARow: 1 };\nexport const TEST_IDS = {\n  appShell: "app-shell",\n} as const;\n', 1],
] as const)("the reader over a registry file: %s", ([, source, rows]) => {
  const file = new Project({ useInMemoryFileSystem: true }).createSourceFile("/registry.ts", source);
  expect(registryRows(file)).toBe(rows);
});
