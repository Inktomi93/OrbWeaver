// The WCAG 1.4.3 inactive-control exemption, proven through the WHOLE instrument (ops/walker/census-text.ts's
// `INACTIVE_KIND_EXPR` interpolation + lib/checks-color.ts's exempt arm) rather than through the classifier
// string alone — a string assertion cannot see the defect this file exists to pin.
//
// THE DEFECT (#1005, measured 2026-09-01 by tests/ui/variant-arm-matrix): the shared classifier was
// ELEMENT-SCOPED (`el.matches(":disabled")`), so the text-bearing element inside a disabled control — a
// `<span>` label inside a disabled `<button>`, the placeholder span inside a disabled Select — matched none
// of its arms, classified "none", and was judged against the 4.5:1 AA floor the exemption absorbs. Every
// disabled control whose label lives in a child element was a standing false P1, which is exactly the class
// of instrument lie that teaches a reader to discount the tool's P1s wholesale.
//
// The fixture ratio is deliberately between the two floors (3.45:1): above WCAG 1.4.11's 3:1 UI-component
// boundary, so `inactive-control-legibility` stays silent, and below AA's 4.5:1, so the pre-fix classifier
// filed `contrast` P1. That separation is what makes this a two-sided proof instead of a swap of one
// finding for another.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliResult, RunCliOpts } from "../../../../support/tool-fixtures.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import type { RelationalPopulationReport } from "../../../../support/ui-audit-relational.ts";
import { RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

/** The proof denominator the `design-audit-rule-proof` gate reads — same shape as the sibling census
 *  suites: evidence attached to an executable registration, so deleting the test deletes the proof. */
interface AuditRuleProof {
  readonly rule: string;
  readonly kind: "fires" | "silent";
  readonly reason: string;
}

interface ToolContext {
  readonly runCli: (tool: string, args: readonly string[], opts?: RunCliOpts) => Promise<CliResult>;
  readonly scratch: string;
}

function auditRuleTest(proofs: readonly AuditRuleProof[], title: string, fn: (context: ToolContext) => Promise<void>): void {
  test(title, ({ runCli, scratch }: ToolContext) => {
    expect(proofs.every((proof) => proof.reason.trim() !== "")).toBe(true);
    return fn({ runCli, scratch });
  });
}

async function auditFixture(scratch: string, runCli: ToolContext["runCli"], name: string, body: string): Promise<RelationalPopulationReport> {
  const reportPath = join(scratch, `${name}.json`);
  await writeFile(join(scratch, `${name}.html`), relationalDocument(body));
  await runCli("ui-audit", ["/" + name + ".html", "--base", `file://${scratch}`, "--out", reportPath], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  return JSON.parse(await readFile(reportPath, "utf8")) as RelationalPopulationReport;
}

/** #8a8a8a on #ffffff = 3.45:1 — under AA's 4.5:1, over 1.4.11's 3:1. */
const DIM_LABEL = "color:#8a8a8a;font-size:16px";
const CONTROL_BOX = "background:#ffffff;border:0;padding:8px;width:140px;height:40px";

// ── silent: the label INSIDE a disabled control is exempt, not a P1 ───────────

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "silent",
      reason:
        "the text-bearing element is a CHILD of the disabled control (the real markup shape: a <span> label inside a disabled <button>), which WCAG 1.4.3 exempts — the classifier must reach the ancestor, not only the element it is bound to",
    },
  ],
  "a label inside a disabled control is excluded as inactive, never filed as a contrast P1",
  async ({ runCli, scratch }) => {
    const body = `<button disabled style="${CONTROL_BOX}"><span style="${DIM_LABEL}">Pick one</span></button>`;
    const report = await auditFixture(scratch, runCli, "inactive-descendant", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(0);
    expect(report.populationAccounting?.["contrast"]?.excluded).toMatchObject({ inactiveExempt: 1 });
    // The advisory is the arm that MUST NOT fire in its place: 3.45:1 is above the UI-component floor.
    expect(report.findings.filter(({ rule }) => rule === "inactive-control-legibility")).toHaveLength(0);
  },
);

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "silent",
      reason: "the aria-disabled spelling of the same shape — a declared-inactive control whose label is a descendant element",
    },
  ],
  "a label inside an aria-disabled control is excluded as inactive",
  async ({ runCli, scratch }) => {
    const body = `<div role="button" aria-disabled="true" style="${CONTROL_BOX}"><span style="${DIM_LABEL}">Pick one</span></div>`;
    const report = await auditFixture(scratch, runCli, "inactive-aria-descendant", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(0);
    expect(report.populationAccounting?.["contrast"]?.excluded).toMatchObject({ inactiveExempt: 1 });
  },
);

// ── fires: the SAME markup with the control enabled is still judged ───────────
// The precision neighbour. Without it the fix above is indistinguishable from a classifier that calls
// everything inactive, which would silently exempt the whole app.

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "fires",
      reason:
        "the identical label/backdrop pair inside an ENABLED control is an ordinary AA failure — the ancestor-aware classifier must not exempt active controls",
    },
  ],
  "the same label inside an enabled control is still judged and fails AA",
  async ({ runCli, scratch }) => {
    const body = `<button style="${CONTROL_BOX}"><span style="${DIM_LABEL}">Pick one</span></button>`;
    const report = await auditFixture(scratch, runCli, "active-descendant", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(1);
    expect(report.populationAccounting?.["contrast"]).toMatchObject({ judged: 1, emitted: 1 });
  },
);
