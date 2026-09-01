// Both-direction controls for the PLACEMENT-COLLISION censuses (#816 arms ii/iii —
// tooling/src/ui-audit/ops/walker/census-occlusion.ts).
//
// EVERY ARM OWES THREE PLANTS, and the negative ones are the point. The frame this family was built
// under is that ZERO findings on the live tree is the SUCCESS condition, which makes a false positive
// the expensive failure — so each rule pins the defect, the NEAR-MISS that must stay silent, and the
// clipped-away subject that must be WITHHELD rather than judged clean. A rule that only proves it can
// fire is a rule nobody can trust to be quiet.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliResult, RunCliOpts } from "../../../../support/tool-fixtures.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import type { RelationalPopulationReport } from "../../../../support/ui-audit-relational.ts";
import { RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

/** The proof denominator the `design-audit-rule-proof` gate reads: every live rule id owes an executable
 *  FIRING proof and an executable NEAREST-LEGITIMATE-NEIGHBOUR SILENCE proof, attached to the test that
 *  exercises it — so deleting the test deletes the proof rather than leaving a claim behind. */
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
  // Vitest parses the fixture callback's first argument SYNTACTICALLY and refuses anything but an object
  // destructuring pattern, so the wrapper has to name the fixtures it forwards rather than pass a bag.
  test(title, ({ runCli, scratch }: ToolContext) => {
    expect(proofs.every((proof) => proof.reason.trim() !== "")).toBe(true);
    return fn({ runCli, scratch });
  });
}

interface AuditRun {
  readonly report: RelationalPopulationReport;
  /** `null` when the process was signalled rather than exiting — never conflated with a clean 0. */
  readonly code: number | null;
}

interface AuditFixture {
  readonly scratch: string;
  readonly runCli: (tool: string, args: readonly string[], opts?: RunCliOpts) => Promise<CliResult>;
  readonly name: string;
  readonly body: string;
  readonly viewport?: string;
}

async function auditFixture({ scratch, runCli, name, body, viewport = "1000x600" }: AuditFixture): Promise<AuditRun> {
  const reportPath = join(scratch, `${name}.json`);
  await writeFile(join(scratch, `${name}.html`), relationalDocument(body));
  const result = await runCli("ui-audit", ["/" + name + ".html", "--base", `file://${scratch}`, "--viewport", viewport, "--out", reportPath], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  return { report: JSON.parse(await readFile(reportPath, "utf8")) as RelationalPopulationReport, code: result.code };
}

/** An opaque bordered content card, sized inside the arm's 100px..80%-of-viewport / \>=60px-tall window. */
const CARD = `<div data-slot="payoff-card" style="position:absolute;left:400px;top:100px;width:400px;height:200px;background:#222;border:1px solid #555"></div>`;

/** A display line at `left`, wide enough that a 60px overlap stays under half its own width. */
function hero(left: number, slot = "hero-line"): string {
  return `<h1 data-slot="${slot}" style="position:absolute;left:${String(left)}px;top:140px;width:360px;margin:0;font-size:48px;line-height:56px">Big Hero Line</h1>`;
}

// ── arm (ii): headline overhanging an opaque card ────────────────────────────

auditRuleTest(
  [
    {
      rule: "headline-overhang",
      kind: "fires",
      reason: "a 48px line whose centre sits left of an opaque bordered card while 60px of its edge clips in - the shape the arm names",
    },
  ],
  "a display headline whose edge clips into an opaque card is a headline-overhang",
  async ({ runCli, scratch }) => {
    // centre 280 is left of the card's 400..800 range, and the 60px intersection is well under half the
    // line's 360px width — the bulk is outside, only the edge is in.
    const { report } = await auditFixture({ scratch, runCli, name: "overhang-defect", body: `${CARD}${hero(100)}` });
    const findings = report.findings.filter(({ rule }) => rule === "headline-overhang");
    expect(findings).toHaveLength(1);
    expect(report.populationAccounting?.["headline-overhang"]).toMatchObject({ candidates: 1, judged: 1, emitted: 1, withheld: {} });
  },
);

auditRuleTest(
  [
    {
      rule: "headline-overhang",
      kind: "silent",
      reason:
        "the nearest legitimate neighbour: identical card and line, moved so the line's centre is inside the card - a headline that lives in a card, which must be excluded rather than flagged",
    },
  ],
  "a headline sitting INSIDE the card is excluded, not flagged",
  async ({ runCli, scratch }) => {
    // Same geometry, moved right: the line's centre (680) is inside the card, so this is a headline that
    // lives in the card. Proven inapplicable — which is a different claim from "measured and clean", and
    // the accounting has to say so.
    const { report } = await auditFixture({ scratch, runCli, name: "overhang-inside", body: `${CARD}${hero(500)}` });
    expect(report.findings.filter(({ rule }) => rule === "headline-overhang")).toHaveLength(0);
    expect(report.populationAccounting?.["headline-overhang"]).toMatchObject({
      candidates: 1,
      judged: 0,
      affected: 0,
      excluded: { "centre-inside-card": 1 },
    });
  },
);

auditRuleTest(
  [
    {
      rule: "headline-overhang",
      kind: "silent",
      reason: "a line whose unclipped rect overlaps the card while its painted rect is empty - the naive-geometry false positive, withheld instead of minted",
    },
  ],
  "a headline clipped away by its own panel is withheld, never judged clean",
  async ({ runCli, scratch }) => {
    // getBoundingClientRect reports the line at its full 56px height even though the 20px-tall
    // overflow:hidden panel paints none of it. A naive rect intersection would compute a collision with
    // the card that no eye ever saw; the painted-rect walk collapses it instead.
    const clipped = `<div data-slot="scroll-panel" style="position:absolute;left:100px;top:100px;width:360px;height:20px;overflow:hidden">
  <h1 data-slot="buried-hero" style="position:relative;top:100px;margin:0;width:360px;font-size:48px;line-height:56px">Big Hero Line</h1>
</div>`;
    const { report, code } = await auditFixture({ scratch, runCli, name: "overhang-clipped", body: `${CARD}${clipped}` });
    expect(report.findings.filter(({ rule }) => rule === "headline-overhang")).toHaveLength(0);
    expect(report.populationAccounting?.["headline-overhang"]).toMatchObject({ candidates: 1, judged: 0, withheld: { "clipped-away": 1 } });
    // A withheld candidate is a NO VERDICT run, not a pass — the runner must refuse rather than report clean.
    expect(code).toBe(2);
  },
);

// ── arm (iii): inline padding leak ───────────────────────────────────────────

/** An `inline` run with an opaque fill — the shape; `padding` decides whether it leaks. */
function inlineFill(padding: number, lineHeight: number, text = "Marker", slot = "marker"): string {
  return `<p style="width:600px;margin:0;font-size:16px;line-height:${String(lineHeight)}px">before <span data-slot="${slot}" style="display:inline;background:#c00;padding-top:${String(padding)}px;padding-bottom:${String(padding)}px">${text}</span> after</p>`;
}

auditRuleTest(
  [
    {
      rule: "inline-padding-leak",
      kind: "fires",
      reason: "display:inline with an opaque fill and 40px of vertical padding painting ~58px over a 20px line - the variant-misapplication shape",
    },
  ],
  "an inline element whose opaque fill runs off its line is an inline-padding-leak",
  async ({ runCli, scratch }) => {
    // 40px of vertical padding on a 20px line: `display: inline` reserves none of it, so the fill paints
    // roughly 58px tall over a 20px line and lands on the copy above and below.
    const { report } = await auditFixture({ scratch, runCli, name: "leak-defect", body: inlineFill(20, 20) });
    const findings = report.findings.filter(({ rule }) => rule === "inline-padding-leak");
    expect(findings).toHaveLength(1);
    expect(report.populationAccounting?.["inline-padding-leak"]).toMatchObject({ candidates: 1, judged: 1, emitted: 1, withheld: {} });
  },
);

auditRuleTest(
  [
    {
      rule: "inline-padding-leak",
      kind: "silent",
      reason:
        "the nearest legitimate neighbour: an opaque inline highlight over the padding floor whose fragment still sits at about one line-height, which is a deliberate highlight and not a leak",
    },
  ],
  "a legitimately padded inline highlight at ~1x line-height stays silent",
  async ({ runCli, scratch }) => {
    // 24px of padding clears the candidate floor, so this IS judged — and passes. The distinction between
    // a highlight and a leak is the rendered multiple, never the padding value on its own.
    const { report } = await auditFixture({ scratch, runCli, name: "leak-highlight", body: inlineFill(12, 24) });
    expect(report.findings.filter(({ rule }) => rule === "inline-padding-leak")).toHaveLength(0);
    expect(report.populationAccounting?.["inline-padding-leak"]).toMatchObject({ candidates: 1, judged: 1, affected: 0 });
  },
);

auditRuleTest(
  [
    {
      rule: "inline-padding-leak",
      kind: "silent",
      reason:
        "a padded inline wrapped across several lines: its bounding rect clears the line-height multiple on wrapping alone, and per-fragment measurement keeps it silent",
    },
  ],
  "a WRAPPING padded inline is judged per line fragment, not by its bounding rect",
  async ({ runCli, scratch }) => {
    // THE UPSTREAM FALSE POSITIVE THIS ARM REFUSES TO INHERIT. Wrapped across several lines, this span's
    // bounding rect is ~4 line-heights tall and clears any "height >= 2.2x line-height" bar on wrapping
    // alone. Each individual fragment is one padded line, which is what the reader actually sees.
    const long = "wrapping highlight ".repeat(12).trim();
    const { report } = await auditFixture({ scratch, runCli, name: "leak-wrapping", body: inlineFill(12, 24, long, "wrapped-highlight"), viewport: "420x600" });
    expect(report.findings.filter(({ rule }) => rule === "inline-padding-leak")).toHaveLength(0);
    expect(report.populationAccounting?.["inline-padding-leak"]).toMatchObject({ candidates: 1, judged: 1, affected: 0 });
  },
);

auditRuleTest(
  [
    {
      rule: "inline-padding-leak",
      kind: "silent",
      reason: "an opaque inline whose vertical padding cannot overflow a line - excluded from the denominator rather than counted as a judged pass",
    },
  ],
  "an inline fill below the padding floor is excluded rather than counted as judged",
  async ({ runCli, scratch }) => {
    const { report } = await auditFixture({ scratch, runCli, name: "leak-below-floor", body: inlineFill(2, 24) });
    expect(report.findings.filter(({ rule }) => rule === "inline-padding-leak")).toHaveLength(0);
    expect(report.populationAccounting?.["inline-padding-leak"]).toMatchObject({ candidates: 1, judged: 0, excluded: { "padding-below-floor": 1 } });
  },
);

auditRuleTest(
  [
    {
      rule: "inline-padding-leak",
      kind: "silent",
      reason: "a leak whose line fragment is clipped entirely out of paint - withheld as unmeasurable rather than reported clean",
    },
  ],
  "an inline leak clipped away by its container is withheld, never judged clean",
  async ({ runCli, scratch }) => {
    // The paragraph is pushed 100px down inside an 8px-tall clipper, so the span's line fragment lands
    // entirely below the clip line and paints nothing. Note the near miss this fixture had to be built
    // around: a clipper that merely SHORTENS the fragment leaves real painted pixels, and that is judged
    // (and passes) rather than withheld — withholding is for a subject the walk could not measure at all.
    const clipped = `<div style="width:600px;height:8px;overflow:hidden"><div style="position:relative;top:100px">${inlineFill(20, 20, "Marker", "clipped-marker")}</div></div>`;
    const { report, code } = await auditFixture({ scratch, runCli, name: "leak-clipped", body: clipped });
    expect(report.findings.filter(({ rule }) => rule === "inline-padding-leak")).toHaveLength(0);
    expect(report.populationAccounting?.["inline-padding-leak"]).toMatchObject({ candidates: 1, judged: 0, withheld: { "clipped-away": 1 } });
    expect(code).toBe(2);
  },
);
