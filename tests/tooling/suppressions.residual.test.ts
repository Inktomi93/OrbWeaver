// RESIDUAL unit test for the `suppressions` gate's BASELINE-BUDGET ratchet arithmetic (both directions):
// a file is clean UP TO its baseline count and REDs only the EXCESS; a file absent from the baseline has
// budget 0; and — the arm `no-test-fabrication` doesn't carry — a baseline entry ABOVE a file's live count
// is itself a STALE-RED, forcing the floor down. Driven via `reconcileSuppressions(root, files, baseline)`
// with an INJECTED baseline map — the gate-conformance runner cannot inject one (an in-memory example
// project has no suppressions.baseline.json on disk, so every example runs at budget 0), so the ratchet is
// un-expressible as a gate example. NAMED `.residual.test.ts` (not `.int.test.ts`) per the no-test-fabrication
// precedent (test-support-dry-punchlist.md Phase 1/2 burndown), but still collected by the vitest `unit` lane.
import { reconcileSuppressions } from "../../tooling/src/verify/gates/suppressions.ts";
import { expect, test } from "../support/tool-fixtures.ts";
import { ctxFor } from "./_support.ts";

const F = "packages/kit/src/widget.ts";
const ONE_MARKER = "// biome-ignore lint/foo: reason\nexport const a = 1;\n";
const TWO_MARKERS = "// biome-ignore lint/foo: reason\nexport const a = 1;\n// eslint-disable-next-line no-unused-vars\nexport const b = 2;\n";

test("baseline ratchet: a file AT its baseline count passes", () => {
  const { root, project } = ctxFor({ [F]: ONE_MARKER });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), { [F]: 1 });
  expect(violations).toEqual([]);
});

test("baseline ratchet: a file EXCEEDING its baseline REDs only the excess", () => {
  const { root, project } = ctxFor({ [F]: TWO_MARKERS });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), { [F]: 1 });
  expect(violations).toHaveLength(1);
});

test("a file ABSENT from the baseline has budget 0 (any suppression is RED)", () => {
  const { root, project } = ctxFor({ [F]: ONE_MARKER });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), {});
  expect(violations).toHaveLength(1);
});

test("both-ways: a baseline entry ABOVE the file's live count is a STALE-RED", () => {
  const { root, project } = ctxFor({ [F]: ONE_MARKER });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), { [F]: 3 });
  expect(violations).toHaveLength(1);
  expect(violations[0]?.message).toContain("stale");
});

test("both-ways: a stale baseline entry for a file with ZERO live markers still REDs", () => {
  const { root, project } = ctxFor({ [F]: "export const a = 1;\n" });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), { [F]: 2 });
  expect(violations).toHaveLength(1);
  expect(violations[0]?.message).toContain("stale");
});

test("a baseline entry EXACTLY at the live count is neither exceed-RED nor stale-RED", () => {
  const { root, project } = ctxFor({ [F]: TWO_MARKERS });
  const { violations } = reconcileSuppressions(root, project.getSourceFiles(), { [F]: 2 });
  expect(violations).toEqual([]);
});

// The ADMITTED half (#551). A green ratchet still carries a live population, and until this number was
// declared the single-pass's "N finding(s) admitted by ratchet baselines" line omitted this gate's entire
// ledger — 346 budgeted markers reading as zero declared debt. It counts what the BUDGET absolved, so it
// is capped by the live count (a stale over-budget row cannot inflate it) and by the budget (an over-budget
// file admits only its allowance; the excess is a violation, not debt).
test("admitted counts the markers the budget ABSOLVED — capped by the live count, and by the budget", () => {
  const { root, project } = ctxFor({ [F]: TWO_MARKERS });
  expect(reconcileSuppressions(root, project.getSourceFiles(), { [F]: 2 }).admitted).toBe(2);
  // Over budget: 1 admitted, 1 reported — never 2 admitted.
  expect(reconcileSuppressions(root, project.getSourceFiles(), { [F]: 1 }).admitted).toBe(1);
  // A STALE row budgeting more than the file carries admits only what is live.
  expect(reconcileSuppressions(root, project.getSourceFiles(), { [F]: 9 }).admitted).toBe(2);
  // No budget, no debt.
  expect(reconcileSuppressions(root, project.getSourceFiles(), {}).admitted).toBe(0);
});
