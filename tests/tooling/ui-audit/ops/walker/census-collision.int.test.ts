// Authored-decision population controls for the collision censuses (#987).
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RelationalPopulationReport } from "@orb/testkit/node";
import { AUDIT_ARGV, configureRelationalCliBudget, RELATIONAL_CLI_TIMEOUT_MS, readAuditReport, relationalDocument } from "@orb/testkit/node";
import type { ToolFixtures } from "@orb/testkit/tooling";
import { auditRuleTest, expect, expectSnapParity, test } from "@orb/testkit/tooling";

configureRelationalCliBudget();

test("truncated text instances collapse by authored decision without erasing a later distinct repair", async ({ runCli, runSnap, scratch }) => {
  const repeated = Array.from(
    { length: 45 },
    (_unused, index) => `<div data-slot="cast-row" style="display:flex;align-items:center;width:220px;padding:12px">
  <div data-slot="cast-name" style="flex:1 1 0%;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:16px">Spire ${String(index)}</div>
  <div style="flex:0 0 auto;width:220px;height:24px;background:#333;font-size:16px">actions</div>
</div>`,
  ).join("");
  const distinct = `<div data-slot="theme-row" style="display:flex;align-items:center;width:220px;padding:12px">
  <div data-slot="theme-name" style="flex:1 1 0%;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:16px">Later distinct theme</div>
  <div style="flex:0 0 auto;width:220px;height:24px;background:#333;font-size:16px">actions</div>
</div>`;
  await writeFile(join(scratch, "truncated-populations.html"), relationalDocument(`${repeated}${distinct}`));
  const auditRun = await expectSnapParity(
    { runCli, runSnap },
    ["--file", join(scratch, "truncated-populations.html"), "--viewport", "1000x3000", ...AUDIT_ARGV],
    { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS },
  );
  const report = await readAuditReport(auditRun.stdout);
  expect(report.findings.filter(({ rule }) => rule === "truncated-to-nothing")).toHaveLength(2);
  expect(report.populationAccounting?.["truncated-to-nothing"]).toMatchObject({
    candidates: 46,
    judged: 46,
    affected: 46,
    populations: 2,
    emitted: 6,
    withheld: { cap: 40 },
  });
});

// ── #1079 (orb-ui audit F7): ECharts canvas ink is EXCLUDED by name, never a silent zero ─────────────
//
// Chart/BarList/Heatmap/Histogram/Scatter/StatFigure all route through chart.tsx's <canvas> — pixels a
// DOM census cannot read (no OCR). A pane with real chart ink and zero findings must still say the ink
// was SEEN and is out of scope, not read identically to a pane with no visual content at all.

auditRuleTest(
  [
    {
      rule: "canvas-ink",
      kind: "fires",
      reason:
        "a visible canvas (chart.tsx's shape) must be EXCLUDED by name — no DOM census can read the pixels it paints, and a silent zero would read as no visual content at all",
    },
  ],
  "a visible canvas produces a canvas-ink EXCLUDED row naming the count",
  async ({ runSnap, scratch }) => {
    const body =
      '<label for="anchor">Anchor</label><input id="anchor" style="width:64px;height:32px" />' +
      '<canvas id="chart-canvas" width="200" height="120" style="display:block"></canvas>';
    await writeFile(join(scratch, "canvas-ink-fires.html"), relationalDocument(body));
    const res = await runSnap(["--file", join(scratch, "canvas-ink-fires.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
    const report = await readAuditReport(res.stdout);
    expect(report.populationAccounting?.["canvas-ink"]).toMatchObject({ candidates: 1, judged: 0, excluded: { canvasPaint: 1 } });
  },
);

auditRuleTest(
  [
    {
      rule: "canvas-ink",
      kind: "silent",
      reason: "a pane with no canvases is the negative control — the census must not manufacture ink that is not there",
      disposition: { kind: "no-candidate" },
    },
  ],
  "a pane with no canvases produces no canvas-ink row",
  async ({ runSnap, scratch }) => {
    const body = '<label for="anchor2">Anchor</label><input id="anchor2" style="width:64px;height:32px" />';
    await writeFile(join(scratch, "canvas-ink-silent.html"), relationalDocument(body));
    const res = await runSnap(["--file", join(scratch, "canvas-ink-silent.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
    const report = await readAuditReport(res.stdout);
    expect(report.populationAccounting?.["canvas-ink"]).toMatchObject({ candidates: 0, excluded: {} });
    return report;
  },
);

// ── truncated-to-nothing past the window edge ─────────────────────────────────
// Corpus Archetypes: an over-wide row pushed the "3 members" count outside the pane clip and off the window,
// so the census never judged it. A subject outside the viewport is judged against its clip. One that is
// merely scrolled away, below the fold or along a scroller that can reach it, stays out of the population.
const NARROW_VIEWPORT = "1280x800";
const PANE = "width:600px;overflow:hidden";
const OVERWIDE_ROW =
  '<div style="display:flex;width:3000px"><span style="flex:none;width:2400px">Archetype name</span><span style="flex:none">3 members</span></div>';

async function collisionFixture(scratch: string, runSnap: ToolFixtures["runSnap"], name: string, body: string): Promise<RelationalPopulationReport> {
  await writeFile(join(scratch, `${name}.html`), relationalDocument(body));
  const res = await runSnap(["--file", join(scratch, `${name}.html`), "--viewport", NARROW_VIEWPORT, ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  return await readAuditReport(res.stdout);
}

auditRuleTest(
  [
    {
      rule: "truncated-to-nothing",
      kind: "fires",
      reason: "a count an over-wide row pushes past its pane clip and off the window is erased, however far off screen it sits",
    },
  ],
  "a count pushed past the window edge by an over-wide row is judged against its clip",
  async ({ runCli, runSnap, scratch }) => {
    // The parity case again, after the file's other runs have used the shared browser.
    const parity: ToolFixtures["runSnap"] = async (args, opts) => await expectSnapParity({ runCli, runSnap }, args, opts);
    const report = await collisionFixture(scratch, parity, "pushed-past-window", `<div style="${PANE}">${OVERWIDE_ROW}</div>`);
    expect(report.findings.filter(({ rule }) => rule === "truncated-to-nothing")).toHaveLength(1);
  },
);

auditRuleTest(
  [
    {
      rule: "truncated-to-nothing",
      kind: "silent",
      reason: "a label below the fold paints inside its clip; scrolling the page reveals it, so nothing is erased",
      disposition: { kind: "excluded", reason: "scrolledOutOfView" },
    },
  ],
  "a label scrolled below the fold stays out of truncated-to-nothing",
  async ({ runSnap, scratch }) => {
    const report = await collisionFixture(
      scratch,
      runSnap,
      "below-the-fold",
      // A block label: an inline box reports no scroll width, so the census reads no natural extent from it.
      `<div style="height:3000px"></div><div style="width:300px;overflow:hidden"><div>3 members</div></div>`,
    );
    expect(report.populationAccounting?.["truncated-to-nothing"]).toMatchObject({ judged: 0, excluded: { scrolledOutOfView: 1 } });
    return report;
  },
);

auditRuleTest(
  [
    {
      rule: "truncated-to-nothing",
      kind: "silent",
      reason: "the same over-wide row inside a horizontal scroller is reachable by scrolling it, so the count is out of view, not erased",
      disposition: { kind: "excluded", reason: "scrolledOutOfView" },
    },
  ],
  "a count past the window edge inside a scroller that reaches it stays out of truncated-to-nothing",
  async ({ runSnap, scratch }) => {
    const report = await collisionFixture(
      scratch,
      runSnap,
      "scroller-reaches",
      `<div style="${PANE}"><div style="width:600px;overflow-x:auto">${OVERWIDE_ROW}</div></div>`,
    );
    expect(report.populationAccounting?.["truncated-to-nothing"]).toMatchObject({ excluded: { scrolledOutOfView: 1 } });
    return report;
  },
);

auditRuleTest(
  [
    {
      rule: "truncated-to-nothing",
      kind: "silent",
      reason: "a scroller with overflow-y hidden is the label's own clip, and scrolling it still reaches the count",
      disposition: { kind: "excluded", reason: "scrolledOutOfView" },
    },
  ],
  "a count past the window edge inside a scroller that is its own clip stays out of truncated-to-nothing",
  async ({ runSnap, scratch }) => {
    const report = await collisionFixture(
      scratch,
      runSnap,
      "scroller-is-clip",
      `<div style="width:600px;overflow-x:auto;overflow-y:hidden">${OVERWIDE_ROW}</div>`,
    );
    expect(report.populationAccounting?.["truncated-to-nothing"]).toMatchObject({ excluded: { scrolledOutOfView: 1 } });
    return report;
  },
);
