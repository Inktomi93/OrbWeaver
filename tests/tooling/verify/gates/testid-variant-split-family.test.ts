// The standing family floor for the two mixed-hook splits converted in #1950 group 5/6:
//
//   `testid-liveness`            → `testid-liveness` (ordinary A1 dead consumer + A2 dead registry row) +
//                                  `testid-liveness-health` (hard registry-read tripwire) — family
//                                  `testid-liveness` over `lib/testid-registry.ts`.
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
//   §4.5 — each `-health` sibling's population is EXACTLY its home file, so an ABSENT home admits zero
//          paths and the runtime REFUSES at the population phase (louder than the legacy `fileLoaded`
//          anchor's silent skip, which is why both anchors retired), and a narrowed request DEFERS every
//          `entire-population` policy in the family.
//   THE HARD REFUSAL — `ui-variant-axes-stamped` is `authority: "hard"`, so a marker aimed at it ALARMS
//          and suppresses nothing. A split that silently softened an authority would pass every other check.
//   §4.6 — the two split differentials against the frozen legacy descriptors (`9e2eca320`, `da01f7eb9`):
//          every legacy example replayed through the frozen legacy `runPass` and through the UNION of the
//          final pair, differences CLASSIFIED, with a PER-EXAMPLE coverage statement for each split arm.
//          The `ui-variant-axes-stamped` tripwire has ZERO legacy coverage by construction (no legacy
//          example loads its real-tree anchor), which is asserted rather than left to look like a pass.
//   THE POPULATION PORT — `testid-liveness`'s legacy `scanRoot` admitted `packages/showcase-plugins/src`,
//          which `@packages` deliberately EXCLUDES; the equality is measured here rather than asserted in
//          a header, because a silently narrowed population is a catch regression no proof row can show.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { Project } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../../../tooling/src/verify/contract/gate.ts";
import type { GatePolicy } from "../../../../tooling/src/verify/contract/policy.ts";
import { POPULATION_ROOTS } from "../../../../tooling/src/verify/contract/population.ts";
import { gate as testid } from "../../../../tooling/src/verify/gates/testid-liveness.ts";
import { gate as testidHealth } from "../../../../tooling/src/verify/gates/testid-liveness-health.ts";
import { gate as variant } from "../../../../tooling/src/verify/gates/ui-variant-axes-stamped.ts";
import { gate as variantHealth } from "../../../../tooling/src/verify/gates/ui-variant-axes-stamped-health.ts";
import { runPass } from "../../../../tooling/src/verify/lib/pass.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { TESTID_REGISTRY_HOME } from "../../../../tooling/src/verify/lib/testid-registry.ts";
import { AXIS_HOME_REL } from "../../../../tooling/src/verify/lib/variant-axis-stamp.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const ROOT = "/testid-variant-split-family";
const TESTID_FAMILY: readonly GatePolicy[] = [testid, testidHealth];
const VARIANT_FAMILY: readonly GatePolicy[] = [variant, variantHealth];
const ALL: readonly GatePolicy[] = [...TESTID_FAMILY, ...VARIANT_FAMILY];
/** The legacy `testid-liveness` tripwire's real-tree anchor, which RETIRED with the population port. */
const LEGACY_TESTID_ANCHOR = "packages/db/src/schema/index.ts";
const LEGACY_TESTID = { sha: "9e2eca320", path: "tooling/src/verify/gates/testid-liveness.ts" } as const;
const LEGACY_VARIANT = { sha: "da01f7eb9", path: "tooling/src/verify/gates/ui-variant-axes-stamped.ts" } as const;
const LEGACY_VARIANT_LIB = { sha: "da01f7eb9", path: "tooling/src/verify/lib/variant-axis-stamp.ts" } as const;
const DIFFERENTIAL_BUDGET_MS = scaledBudget(120_000);

function toolingHref(relative: string): string {
  return JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/verify", relative.replace(/^\.\.\//u, ""))).href);
}

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

test("all four policies preserve their founding fixtures", () => {
  expect(verifyPolicyProofs(ALL)).toEqual([]);
});

// ─── THE POPULATION PORT — measured, not asserted ───────────────────────────────────────────────────────
test("testid-liveness's declared roots reproduce the legacy scanRoot, showcase-plugins included", () => {
  // The legacy predicate, verbatim from `9e2eca320`.
  const legacyAdmits = (path: string): boolean => (path.includes("packages/") && path.includes("/src/")) || path.includes("tests/");
  const roots = testid.population as readonly ("@packages" | "@showcase" | "@tests")[];
  const prefixes = roots
    .flatMap((root) => (root === "@packages" ? ["@client", "@ui", "@server", "@db", "@contracts", "@kit"] : [root]))
    .flatMap((leaf) => POPULATION_ROOTS[leaf as keyof typeof POPULATION_ROOTS]);
  // Every declared prefix is admitted by the legacy predicate…
  for (const prefix of prefixes) {
    expect(legacyAdmits(`${prefix}x.ts`), prefix).toBe(true);
  }
  // …and the one root a lane silently loses by reaching for `@packages`/`@authored` alone is present.
  expect(prefixes).toContain("packages/showcase-plugins/src/");
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
test("each -health sibling REFUSES at the population phase when its home is absent", () => {
  const testidRun = passOf([testidHealth], { "packages/client/src/lib/other.ts": "export const x = 1;\n" });
  expect(testidRun.toolErrors.map((error) => `${error.policyId}/${error.phase}`)).toEqual(["testid-liveness-health/population"]);
  expect(testidRun.authority.effectiveFindings).toEqual([]);
  const variantRun = passOf([variantHealth], { "packages/ui/src/lib/other.ts": "export const x = 1;\n" });
  expect(variantRun.toolErrors.map((error) => `${error.policyId}/${error.phase}`)).toEqual(["ui-variant-axes-stamped-health/population"]);
  expect(variantRun.authority.effectiveFindings).toEqual([]);
  // This refusal IS the retired `fileLoaded` anchor's successor: the legacy arms skipped SILENTLY when
  // their real-tree anchor was absent, which is the state a converted tripwire must never reproduce.
});

test("a narrowed request DEFERS every entire-population policy in both families", () => {
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

// ─── §4.6 DIFFERENTIALS ─────────────────────────────────────────────────────────────────────────────────
async function frozenLegacy(
  legacy: { readonly sha: string; readonly path: string },
  scratch: string,
  extra: readonly [string, string][] = [],
): Promise<GateDescriptor> {
  const source = execFileSync("git", ["show", `${legacy.sha}:${legacy.path}`], { encoding: "utf8" });
  const target = join(scratch, basename(legacy.path));
  // The copy lives outside the checkout, so its RELATIVE imports are rewritten to file URLs of the LIVE
  // modules — except the ones listed in `extra`, which are frozen beside it because this conversion
  // CHANGED them (the shared reader lost its per-SourceFile and workspace-opening entry points).
  let rewritten = source
    .replaceAll('from "../contract/gate.ts"', `from ${toolingHref("../contract/gate.ts")}`)
    .replaceAll('from "../lib/pass.ts"', `from ${toolingHref("../lib/pass.ts")}`)
    .replaceAll('from "../lib/ast-read.ts"', `from ${toolingHref("../lib/ast-read.ts")}`)
    .replaceAll(
      'from "../../_shared/ratchet-rows.ts"',
      `from ${JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/_shared/ratchet-rows.ts")).href)}`,
    );
  for (const [specifier, frozenPath] of extra) {
    rewritten = rewritten.replaceAll(`from "${specifier}"`, `from ${JSON.stringify(pathToFileURL(join(scratch, basename(frozenPath))).href)}`);
  }
  expect(rewritten).not.toBe(source);
  writeFileSync(target, rewritten);
  return ((await import(`${pathToFileURL(target).href}?frozen=${basename(legacy.path)}`)) as { readonly gate: GateDescriptor }).gate;
}

function freezeLegacyModule(legacy: { readonly sha: string; readonly path: string }, scratch: string): void {
  const source = execFileSync("git", ["show", `${legacy.sha}:${legacy.path}`], { encoding: "utf8" });
  const rewritten = source
    .replaceAll(
      'from "../../_shared/ts-workspace.ts"',
      `from ${JSON.stringify(pathToFileURL(join(process.cwd(), "tooling/src/_shared/ts-workspace.ts")).href)}`,
    )
    .replaceAll('from "./ast-read.ts"', `from ${toolingHref("../lib/ast-read.ts")}`);
  expect(rewritten).not.toBe(source);
  writeFileSync(join(scratch, basename(legacy.path)), rewritten);
}

interface LegacyFinding {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly token?: string;
  readonly message?: string;
}

function legacyFindings(descriptor: GateDescriptor, files: Readonly<Record<string, string>>): readonly LegacyFinding[] {
  const project = projectOf(files);
  const result = runPass([descriptor], {
    root: ROOT,
    project,
    scope: { kind: "project" },
    files: project.getSourceFiles(),
    checker: () => project.getTypeChecker(),
  });
  expect(result.toolErrors).toEqual([]);
  return result.gates[0]?.findings ?? [];
}

const sorted = (lines: readonly string[]): readonly string[] => lines.toSorted((left, right) => left.localeCompare(right));

function legacyFiles(example: GateExample, fallback: string): Readonly<Record<string, string>> {
  return typeof example.files === "string" ? { [example.at ?? fallback]: example.files } : example.files;
}

test(
  "testid-liveness + testid-liveness-health reproduce the frozen legacy gate on every original example",
  async ({ scratch }) => {
    const legacy = await frozenLegacy(LEGACY_TESTID, scratch);
    const examples = [...legacy.mustFlag, ...legacy.mustPass];
    expect(examples).toHaveLength(9);
    const coverage = { consumer: 0, registryRow: 0, tripwire: 0 };
    for (const example of examples) {
      const files = legacyFiles(example, "tests/client/x.ct.tsx");
      const before = legacyFindings(legacy, files);
      const expected = sorted(
        before.map((finding) => {
          if (finding.line === 0) {
            // CLASSIFIED DIFFERENCE 1 — ARM SPLIT + ANCHOR MOVE: the A3 tripwire is its own hard policy and
            // the final contract forbids a zero coordinate, so the same file finding lands at 1:1.
            coverage.tripwire += 1;
            return `TRIPWIRE ${finding.file}:1:1`;
          }
          if (finding.file === TESTID_REGISTRY_HOME) {
            // A2's position is UNCHANGED: the legacy anchored the bare key at offset 0 of the property
            // assignment, and the final anchors the same key through the property's own name node.
            coverage.registryRow += 1;
            return `ROW ${finding.file}:${finding.line}:${finding.column} ${finding.token ?? "<none>"}`;
          }
          // CLASSIFIED DIFFERENCE 2 — ANCHOR MOVE, asserted by CONTAINMENT below rather than by an
          // arithmetic column shift, because the shift is not uniform: the legacy token was the bare VALUE
          // at its `indexOf` offset inside the reported node, and for a `getByTestId("x")` that is one
          // column right of the quote while for a `[data-testid="x"]` SELECTOR it is fourteen columns
          // inside the literal. The final token is the whole authored literal (`lib/caught-failure.ts`'s
          // anchor contract), so the honest statement of the move is "the final position is the start of
          // the authored literal that CONTAINS the legacy position" — which is what is pinned.
          coverage.consumer += 1;
          return `CONSUMER ${finding.file}:${finding.line}`;
        }),
      );
      // EMPTY ADMISSION: the tripwire's population is EXACTLY the registry home, so a legacy example that
      // does not carry it refuses at the population phase (pinned above) and only the ordinary half runs.
      const policies = Object.keys(files).includes(TESTID_REGISTRY_HOME) ? TESTID_FAMILY : [testid];
      const after = passOf(policies, files);
      expect(after.toolErrors, example.why).toEqual([]);
      const actual = sorted(
        after.authority.effectiveFindings.map((finding) => {
          if (finding.policyId === testidHealth.id) {
            return `TRIPWIRE ${finding.file}:${finding.line}:${finding.column}`;
          }
          if (finding.file === TESTID_REGISTRY_HOME && finding.token !== undefined && !finding.token.startsWith('"')) {
            return `ROW ${finding.file}:${finding.line}:${finding.column} ${finding.token}`;
          }
          return `CONSUMER ${finding.file}:${finding.line}`;
        }),
      );
      expect(actual, example.why).toEqual(expected);
      // The anchor move, stated exactly: every final consumer position is the start of an authored literal
      // whose span CONTAINS the legacy position, on the same line of the same file. An anchor that drifted
      // off the value — the way a positioned waiver silently orphans (§4.6 category 6) — fails here.
      for (const final of after.authority.effectiveFindings.filter((row) => row.policyId === testid.id && row.file !== TESTID_REGISTRY_HOME)) {
        const legacyAt = before.filter((row) => row.file === final.file && row.line === final.line);
        expect(legacyAt.length, `${example.why} — one legacy consumer at ${final.file}:${final.line}`).toBe(1);
        const legacyColumn = (legacyAt[0] as LegacyFinding).column;
        const token = final.token ?? "";
        expect(final.column, example.why).toBeLessThanOrEqual(legacyColumn);
        expect(legacyColumn, example.why).toBeLessThan(final.column + token.length);
      }
    }
    // Legacy-side coverage, MEASURED: three consumer findings (the `getByTestId` literal, the
    // `[data-testid="x"]` selector, and the `testId("k")` keyed consumer), one dead registry row, and one
    // tripwire red. Every arm the split touched was exercised — the statement §4.6 asks for, and the thing
    // that stops a vacuous replay reading as a passing one.
    expect(coverage).toEqual({ consumer: 3, registryRow: 1, tripwire: 1 });
    // …and the retired real-tree anchor was load-bearing for exactly that one example.
    expect(examples.some((example) => Object.keys(legacyFiles(example, "x")).includes(LEGACY_TESTID_ANCHOR))).toBe(true);
  },
  DIFFERENTIAL_BUDGET_MS,
);

test(
  "ui-variant-axes-stamped + its health sibling reproduce the frozen legacy gate on every original example",
  async ({ scratch }) => {
    freezeLegacyModule(LEGACY_VARIANT_LIB, scratch);
    const legacy = await frozenLegacy(LEGACY_VARIANT, scratch, [["../lib/variant-axis-stamp.ts", LEGACY_VARIANT_LIB.path]]);
    const examples = [...legacy.mustFlag, ...legacy.mustPass];
    expect(examples).toHaveLength(8);
    let recipeFindings = 0;
    let tripwireFindings = 0;
    for (const example of examples) {
      const files = legacyFiles(example, "packages/ui/src/primitives/thing/variants.ts");
      const before = legacyFindings(legacy, files);
      // CLASSIFIED DIFFERENCE — ARM RETIREMENT: A4 (the stale ratchet row) dies with its baseline, and its
      // legacy verdict was anchored on the gate module's own path. No legacy example produces one.
      expect(
        before.filter((finding) => finding.file === LEGACY_VARIANT.path),
        example.why,
      ).toEqual([]);
      // CLASSIFIED DIFFERENCE — ARM SPLIT with ZERO LEGACY COVERAGE: the A5 tripwire is guarded on a
      // real-tree anchor no legacy example loads, so replaying the corpus exercises it zero times. That is
      // ASSERTED here rather than left to look like a clean pass (§4.6), and the successor proof is the
      // health policy's own four constructed `mustFlag` rows.
      expect(
        before.filter((finding) => finding.file === AXIS_HOME_REL),
        example.why,
      ).toEqual([]);
      recipeFindings += before.length;
      const expected = sorted(before.map((finding) => `${finding.file}:${finding.line}:${finding.column} ${finding.token ?? "<none>"}`));
      // The tripwire's population is EXACTLY the axis home; every legacy example carries it except the one
      // that deliberately omits it, so the union is taken over whichever half the fileset admits.
      const policies = Object.keys(files).includes(AXIS_HOME_REL) ? VARIANT_FAMILY : [variant];
      const after = passOf(policies, files);
      expect(after.toolErrors, example.why).toEqual([]);
      tripwireFindings += after.authority.effectiveFindings.filter((finding) => finding.policyId === variantHealth.id).length;
      // POSITION is byte-identical on every recipe arm: both sides anchor the declaration's own name node.
      const actual = sorted(
        after.authority.effectiveFindings.map((finding) => `${finding.file}:${finding.line}:${finding.column} ${finding.token ?? "<none>"}`),
      );
      expect(actual, example.why).toEqual(expected);
    }
    // Legacy-side coverage: the three recipe arms fired four times across the corpus (A1 once, A2 once,
    // A3 twice), and the tripwire zero times on BOTH sides — a real-tree-anchored arm the legacy suite
    // never reached, which is exactly where a split's differential is weakest.
    expect(recipeFindings).toBe(4);
    expect(tripwireFindings).toBe(0);
  },
  DIFFERENTIAL_BUDGET_MS,
);
