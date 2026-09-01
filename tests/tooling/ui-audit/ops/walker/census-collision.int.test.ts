// Authored-decision population controls for the collision censuses (#987).
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import type { RelationalPopulationReport } from "../../../../support/ui-audit-relational.ts";
import { RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

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
  const reportPath = join(scratch, "truncated-populations.json");
  await writeFile(join(scratch, "truncated-populations.html"), relationalDocument(`${repeated}${distinct}`));
  await runCli("ui-audit", ["/truncated-populations.html", "--base", `file://${scratch}`, "--viewport", "1000x3000", "--out", reportPath], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(reportPath, "utf8")) as RelationalPopulationReport;
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
  const reportPath = join(scratch, "obscured-populations.json");
  await writeFile(join(scratch, "obscured-populations.html"), relationalDocument(`${repeated}${distinct}`));
  await runCli("ui-audit", ["/obscured-populations.html", "--base", `file://${scratch}`, "--out", reportPath], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(reportPath, "utf8")) as RelationalPopulationReport;
  expect(report.findings.filter(({ rule }) => rule === "obscured-target")).toHaveLength(2);
  expect(report.populationAccounting?.["obscured-target"]).toMatchObject({
    affected: 24,
    populations: 2,
    emitted: 6,
    withheld: { cap: 18 },
  });
});
