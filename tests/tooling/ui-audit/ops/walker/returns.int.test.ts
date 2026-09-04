// Complete-denominator control for the capped relational sample return (#984).
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import type { RelationalPopulationReport } from "../../../../support/ui-audit-relational.ts";
import { AUDIT_ARGV, auditReport, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

test("every capped relational census publishes the complete candidate, judged, emitted, and cap-withheld population", async ({ runCli, scratch }) => {
  const cohorts = Array.from(
    { length: 14 },
    (_unused, index) =>
      `<section><div data-slot="cohort-${String(index)}" style="height:32px">a</div><div data-slot="cohort-${String(index)}" style="height:32px">b</div><div data-slot="cohort-${String(index)}" style="height:16px">c</div></section>`,
  ).join("");
  const rows = Array.from(
    { length: 10 },
    (_unused, index) =>
      `<div style="display:flex;justify-content:space-between;width:1000px"><label id="label-${String(index)}" for="control-${String(index)}">setting ${String(index)}</label><button id="control-${String(index)}" aria-labelledby="label-${String(index)}" style="width:48px;height:24px">on</button></div>`,
  ).join("");
  const panes = Array.from(
    { length: 8 },
    (_unused, index) => `<section role="region" aria-label="pane ${String(index)}" style="height:500px;overflow:hidden"><p>a</p><p>b</p><p>c</p></section>`,
  ).join("");
  await writeFile(join(scratch, "relational-accounting.html"), relationalDocument(`${cohorts}${rows}${panes}`));
  const res = await runCli("snap", ["--file", join(scratch, "relational-accounting.html"), ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as RelationalPopulationReport;
  expect(report.populationAccounting?.["cohort-anatomy"]).toMatchObject({
    candidates: 14,
    judged: 14,
    emitted: 12,
    withheld: { cap: 2 },
  });
  expect(report.populationAccounting?.["row-void"]).toMatchObject({ candidates: 10, judged: 10, emitted: 8, withheld: { cap: 2 } });
  expect(report.populationAccounting?.["pane-ink"]).toMatchObject({ candidates: 8, judged: 8, emitted: 6, withheld: { cap: 2 } });
});
