// Authored-decision population controls for the collision censuses (#987).
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliResult, RunCliOpts } from "../../../../support/tool-fixtures.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import type { RelationalPopulationReport } from "../../../../support/ui-audit-relational.ts";
import { AUDIT_ARGV, auditReport, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

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

test("truncated text instances collapse by authored decision without erasing a later distinct repair", async ({ runCli, scratch }) => {
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
  const auditRun = await runCli("snap", ["--file", join(scratch, "truncated-populations.html"), "--viewport", "1000x3000", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(auditRun.stdout), "utf8")) as RelationalPopulationReport;
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

test("obscured targets scan past the old cap and retain a later distinct collision decision", async ({ runCli, scratch }) => {
  const collision = (
    home: string,
    loser: string,
    winner: string,
    text: string,
  ): string => `<div data-slot="${home}" style="position:relative;width:180px;height:24px">
  <span data-slot="${loser}" style="position:absolute;left:0;top:0;width:48px;height:20px;background:#333">${text}</span>
  <button data-slot="${winner}" style="position:absolute;left:12px;top:0;width:80px;height:20px">Go</button>
</div>`;
  const repeated = Array.from({ length: 23 }, () => collision("cast-row", "rule-count", "start", "2 rules")).join("");
  const distinct = collision("archive-row", "archive-label", "delete", "Archive");
  await writeFile(join(scratch, "obscured-populations.html"), relationalDocument(`${repeated}${distinct}`));
  const auditRun = await runCli("snap", ["--file", join(scratch, "obscured-populations.html"), ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(auditRun.stdout), "utf8")) as RelationalPopulationReport;
  expect(report.findings.filter(({ rule }) => rule === "obscured-target")).toHaveLength(2);
  expect(report.populationAccounting?.["obscured-target"]).toMatchObject({
    affected: 24,
    populations: 2,
    emitted: 6,
    withheld: { cap: 18 },
  });
});

test("obscured withholding names the exact partially visible subject and centre", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "obscured-unaskable.html"),
    relationalDocument('<p data-slot="edge-copy" style="position:fixed;left:-80px;top:20px;width:100px;height:24px">Edge copy</p>'),
  );
  const result = await runCli("snap", ["--file", join(scratch, "obscured-unaskable.html"), "--viewport", "400x240", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(result.stdout), "utf8")) as RelationalPopulationReport;

  expect(result.code).toBe(2);
  expect(report.obscuredUnaskable).toEqual([
    expect.objectContaining({
      selector: expect.stringContaining("data-slot=edge-copy"),
      reason: "centre-outside-frame",
      centre: expect.objectContaining({ x: -30 }),
    }),
  ]);
  expect(report.populationAccounting?.["obscured-target"]).toMatchObject({ candidates: 1, judged: 0, withheld: { unaskable: 1 } });
});

test("obscured census recentres a partially visible subject before judging its centre", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "obscured-recentred.html"),
    relationalDocument(
      '<div style="height:220px"></div><button data-slot="bottom-action" style="display:block;width:160px;height:80px">Bottom action</button>',
    ),
  );
  const result = await runCli("snap", ["--file", join(scratch, "obscured-recentred.html"), "--viewport", "400x240", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(result.stdout), "utf8")) as RelationalPopulationReport;

  expect(result.code).toBe(0);
  expect(report.obscuredRecentred).toBe(1);
  expect(report.obscuredUnaskable).toEqual([]);
  expect(report.populationAccounting?.["obscured-target"]).toMatchObject({ candidates: 1, judged: 1, withheld: { unaskable: 0 } });
});

test("obscured census keeps a null compositor answer withheld after the centre is in frame", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "obscured-hit-test-null.html"),
    relationalDocument(`<span data-slot="null-hit" style="display:block;width:120px;height:40px">Null answer</span>
<script>Object.defineProperty(document, "elementFromPoint", { value: function () { return null; } });</script>`),
  );
  const result = await runCli("snap", ["--file", join(scratch, "obscured-hit-test-null.html"), "--viewport", "400x240", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(result.stdout), "utf8")) as RelationalPopulationReport;

  expect(result.code).toBe(2);
  expect(report.obscuredUnaskable).toEqual([expect.objectContaining({ selector: expect.stringContaining("data-slot=null-hit"), reason: "hit-test-null" })]);
  expect(report.populationAccounting?.["obscured-target"]).toMatchObject({ candidates: 1, judged: 0, withheld: { unaskable: 1 } });
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
  async ({ runCli, scratch }) => {
    const body =
      '<label for="anchor">Anchor</label><input id="anchor" style="width:64px;height:32px" />' +
      '<canvas id="chart-canvas" width="200" height="120" style="display:block"></canvas>';
    await writeFile(join(scratch, "canvas-ink-fires.html"), relationalDocument(body));
    const res = await runCli("snap", ["--file", join(scratch, "canvas-ink-fires.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
    const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as RelationalPopulationReport;
    expect(report.populationAccounting?.["canvas-ink"]).toMatchObject({ candidates: 1, judged: 0, excluded: { canvasPaint: 1 } });
  },
);

auditRuleTest(
  [
    {
      rule: "canvas-ink",
      kind: "silent",
      reason: "a pane with no canvases is the negative control — the census must not manufacture ink that is not there",
    },
  ],
  "a pane with no canvases produces no canvas-ink row",
  async ({ runCli, scratch }) => {
    const body = '<label for="anchor2">Anchor</label><input id="anchor2" style="width:64px;height:32px" />';
    await writeFile(join(scratch, "canvas-ink-silent.html"), relationalDocument(body));
    const res = await runCli("snap", ["--file", join(scratch, "canvas-ink-silent.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
    const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as RelationalPopulationReport;
    expect(report.populationAccounting?.["canvas-ink"]).toMatchObject({ candidates: 0, excluded: {} });
  },
);
