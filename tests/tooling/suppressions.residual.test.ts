// RESIDUAL unit test for the `suppressions` gate's BASELINE-BUDGET ratchet arithmetic (both directions):
// a file is clean UP TO its baseline count and REDs only the EXCESS; a file absent from the baseline has
// budget 0; and — the arm `no-test-fabrication` doesn't carry — a baseline entry ABOVE a file's live count
// is itself a STALE-RED, forcing the floor down. Driven via `reconcileSuppressions(root, files, baseline)`
// with an INJECTED baseline map — the gate-conformance runner cannot inject one (an in-memory example
// project has no suppressions.baseline.json on disk, so every example runs at budget 0), so the ratchet is
// un-expressible as a gate example. Baselines are injected through the SHARED row parser (#569), so a
// test can never exercise a row shape the real ledger reader would refuse. NAMED `.residual.test.ts` (not `.int.test.ts`) per the no-test-fabrication
// precedent (test-support-dry-punchlist.md Phase 1/2 burndown), but still collected by the vitest `unit` lane.
import { parseBudgetMap } from "@orb/tooling/_shared/ratchet-rows";
import { reconcileSuppressions } from "../../tooling/src/verify/gates/suppressions.ts";
import { expect, test } from "../support/tool-fixtures.ts";
import { ctxFor } from "./_support.ts";

const F = "packages/kit/src/widget.ts";
const TOOLING_F = "tooling/src/widget.ts";
const SCRIPT_F = "scripts/widget.tsx";
const ONE_MARKER = "// biome-ignore lint/foo: reason\nexport const a = 1;\n";
const TWO_MARKERS = "// biome-ignore lint/foo: reason\nexport const a = 1;\n// eslint-disable-next-line no-unused-vars\nexport const b = 2;\n";

test("baseline ratchet: a file AT its baseline count passes", () => {
  const { root, project } = ctxFor({ [F]: ONE_MARKER });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({ [F]: 1 }));
  expect(violations).toEqual([]);
});

test("baseline ratchet: a file EXCEEDING its baseline REDs only the excess", () => {
  const { root, project } = ctxFor({ [F]: TWO_MARKERS });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({ [F]: 1 }));
  expect(violations).toHaveLength(1);
});

test("a file ABSENT from the baseline has budget 0 (any suppression is RED)", () => {
  const { root, project } = ctxFor({ [F]: ONE_MARKER });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({}));
  expect(violations).toHaveLength(1);
});

test.each([TOOLING_F, SCRIPT_F])("new governed root: %s is budgeted and missing-baseline RED", (file) => {
  const { root, project } = ctxFor({ [file]: ONE_MARKER });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({}));
  expect(violations).toHaveLength(1);
  expect(violations[0]?.file).toBe(file);
});

test.each([TOOLING_F, SCRIPT_F])("new governed root: %s stale baseline rows RED", (file) => {
  const { root, project } = ctxFor({ [file]: "export const a = 1;\n" });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({ [file]: 1 }));
  expect(violations).toHaveLength(1);
  expect(violations[0]?.message).toContain("stale");
});

test("exact directive grammar counts biome-ignore-start/end as distinct suppression tokens", () => {
  const source =
    "// biome-ignore-start lint/suspicious/noUnnecessaryConditions: live guard\n" +
    "export const a = 1;\n" +
    "// biome-ignore-end lint/suspicious/noUnnecessaryConditions: end live guard\n";
  const { root, project } = ctxFor({ [F]: source });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({}));
  expect(violations.map((violation) => violation.message)).toEqual([
    expect.stringContaining("`biome-ignore-start`"),
    expect.stringContaining("`biome-ignore-end`"),
  ]);
});

test("directive words in prose comments and fixture strings are not suppression markers", () => {
  const source =
    '// This fixture string mentions biome-ignore lint/foo: without issuing a directive.\nexport const a = "// eslint-disable-next-line no-alert";\n';
  const { root, project } = ctxFor({ [TOOLING_F]: source });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({}));
  expect(violations).toEqual([]);
});

test("authored st-goldens scripts are governed but the captured foreign runtime is excluded", () => {
  const authored = "scripts/probes/st-goldens/generate-goldens.ts";
  const captured = "scripts/probes/st-goldens/sillytavern-runtime/vendor.tsx";
  const { root, project } = ctxFor({ [authored]: ONE_MARKER, [captured]: ONE_MARKER });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({}));
  expect(violations).toHaveLength(1);
  expect(violations[0]?.file).toBe(authored);
});

test("both-ways: a baseline entry ABOVE the file's live count is a STALE-RED", () => {
  const { root, project } = ctxFor({ [F]: ONE_MARKER });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({ [F]: 3 }));
  expect(violations).toHaveLength(1);
  expect(violations[0]?.message).toContain("stale");
});

test("both-ways: a stale baseline entry for a file with ZERO live markers still REDs", () => {
  const { root, project } = ctxFor({ [F]: "export const a = 1;\n" });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({ [F]: 2 }));
  expect(violations).toHaveLength(1);
  expect(violations[0]?.message).toContain("stale");
});

test("a baseline entry EXACTLY at the live count is neither exceed-RED nor stale-RED", () => {
  const { root, project } = ctxFor({ [F]: TWO_MARKERS });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({ [F]: 2 }));
  expect(violations).toEqual([]);
});

// The ADMITTED half (#551). A green ratchet still carries a live population, and until this number was
// declared the single-pass's "N finding(s) admitted by ratchet baselines" line omitted this gate's entire
// ledger — 346 budgeted markers reading as zero declared debt. It counts what the BUDGET absolved, so it
// is capped by the live count (a stale over-budget row cannot inflate it) and by the budget (an over-budget
// file admits only its allowance; the excess is a violation, not debt).
test("admitted counts the markers the budget ABSOLVED — capped by the live count, and by the budget", () => {
  const { root, project } = ctxFor({ [F]: TWO_MARKERS });
  expect(reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({ [F]: 2 })).admitted).toBe(2);
  // Over budget: 1 admitted, 1 reported — never 2 admitted.
  expect(reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({ [F]: 1 })).admitted).toBe(1);
  // A STALE row budgeting more than the file carries admits only what is live.
  expect(reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({ [F]: 9 })).admitted).toBe(2);
  // No budget, no debt.
  expect(reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({})).admitted).toBe(0);
});

// THE CLASS SPLIT (#569). The gate's `admittedRatified` is the RATIFIED SUBSET of `admitted` — the part a
// recorded ruling / documented tool-FP made permanent — and the two halves are what every consumer prints.
// The classification is DERIVED from the rule table, never taken from the row: a row DECLARING a partition
// the tree does not earn is its own violation, which is what stops a hand-edit minting permanence.
const RATIFIED_MARKER = "// biome-ignore lint/style/noMagicNumbers: protocol sentinel\nexport const a = 1;\n";
// DELIBERATELY SYNTHETIC rule id (#596): this fixture stands for "a rule the table does not list", so naming a
// REAL rule couples it to the table's contents — the fixture used `noExcessiveCognitiveComplexity` and these
// two controls flipped from red to green the day that rule was ratified. A rule id no linter emits can never
// be ratified, so the unlisted-rule arm stays testable forever.
const DEBT_MARKER = "// biome-ignore lint/nursery/noRuleTheTableWillNeverList: an unratified rule\nexport const b = 2;\n";

test("a marker whose rule is in RATIFIED_RULES admits as RATIFIED; an unlisted rule stays burnable DEBT", () => {
  const { root, project } = ctxFor({ [F]: RATIFIED_MARKER });
  const ratified = reconcileSuppressions(
    root,
    project.getSourceFiles(),
    parseBudgetMap({ [F]: { count: 1, ratified: 1, why: "ruled", cite: ["package.json"] } }),
  );
  expect(ratified.admitted).toBe(1);
  expect(ratified.admittedRatified).toBe(1);

  const { root: r2, project: p2 } = ctxFor({ [F]: DEBT_MARKER });
  const debt = reconcileSuppressions(r2, p2.getSourceFiles(), parseBudgetMap({ [F]: 1 }));
  expect(debt.admitted).toBe(1);
  expect(debt.admittedRatified).toBe(0);
});

test("PLANTED CONTROL — a row DECLARING a ratified portion the rule table does not earn is RED", () => {
  const { root, project } = ctxFor({ [F]: DEBT_MARKER });
  const { violations } = reconcileSuppressions(
    root,
    project.getSourceFiles(),
    parseBudgetMap({ [F]: { count: 1, ratified: 1, why: "invented", cite: ["package.json"] } }),
  );
  expect(violations.some((v) => v.message.includes("the class is DERIVED from RATIFIED_RULES"))).toBe(true);
});

test("PLANTED CONTROL — a row that UNDER-declares its ratified portion is equally RED (both directions)", () => {
  const { root, project } = ctxFor({ [F]: RATIFIED_MARKER });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), parseBudgetMap({ [F]: 1 }));
  expect(violations.some((v) => v.message.includes("the class is DERIVED from RATIFIED_RULES"))).toBe(true);
});
