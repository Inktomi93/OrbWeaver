// Adversarial row-binding control for #984 through the shipped CLI and real Chromium geometry.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import type { RelationalPopulationReport } from "../../../../support/ui-audit-relational.ts";
import { AUDIT_ARGV, auditReport, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

test("row-void rejects an unbound title/actions topbar even when its rendered gap is enormous", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "unbound-topbar.html"),
    relationalDocument(`<header style="display:flex;justify-content:space-between;align-items:center;width:1000px;height:48px">
  <h1 style="font-size:18px">Appearance</h1>
  <div><button style="width:80px;height:32px">Reset</button><button style="width:80px;height:32px">Save</button></div>
</header>`),
  );
  const res = await runCli("snap", ["--file", join(scratch, "unbound-topbar.html"), ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as RelationalPopulationReport;
  expect(report.populationAccounting?.["row-void"]).toMatchObject({
    candidates: 1,
    judged: 0,
    withheld: {},
    excluded: { unbound: 1 },
  });
  expect(
    report.findings.map((finding) => finding.rule),
    "visual adjacency is not a label/control binding",
  ).not.toContain("row-void");
  expect(res.stdout).toContain("excluded(unbound=1)");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
  await expect(res).toExitWith(0);
});

test("cohort-anatomy withholds an actively animating cohort instead of counting it judged", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "animating-cohort.html"),
    relationalDocument(`<style>@keyframes hold { from { opacity:.99 } to { opacity:1 } }</style><section>
  <div data-slot="setting-row" style="height:32px;animation:hold 60s infinite">a</div>
  <div data-slot="setting-row" style="height:32px">b</div>
  <div data-slot="setting-row" style="height:16px">c</div>
</section>`),
  );
  const res = await runCli("snap", ["--file", join(scratch, "animating-cohort.html"), ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as RelationalPopulationReport;
  expect(report.populationAccounting?.["cohort-anatomy"]).toMatchObject({ candidates: 1, judged: 0, withheld: { animating: 1 } });
  expect(report.findings.map(({ rule }) => rule)).not.toContain("cohort-anatomy");
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  await expect(res).toExitWith(2);
});

test("cohort-anatomy judges a retained animation after its play state is finished", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "finished-cohort.html"),
    relationalDocument(`<style>@keyframes done { from { opacity:.99 } to { opacity:1 } }</style><section>
  <div data-slot="setting-row" style="height:32px;animation:done 1ms forwards">a</div>
  <div data-slot="setting-row" style="height:32px">b</div>
  <div data-slot="setting-row" style="height:32px">c</div>
</section>`),
  );
  const res = await runCli("snap", ["--file", join(scratch, "finished-cohort.html"), ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as RelationalPopulationReport;
  expect(report.populationAccounting?.["cohort-anatomy"]).toMatchObject({ candidates: 1, judged: 1, withheld: {} });
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});
