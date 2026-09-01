// Adversarial row-binding control for #984 through the shipped CLI and real Chromium geometry.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import type { RelationalPopulationReport } from "../../../../support/ui-audit-relational.ts";
import { RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

test("row-void rejects an unbound title/actions topbar even when its rendered gap is enormous", async ({ runCli, scratch }) => {
  const reportPath = join(scratch, "unbound-topbar.json");
  await writeFile(
    join(scratch, "unbound-topbar.html"),
    relationalDocument(`<header style="display:flex;justify-content:space-between;align-items:center;width:1000px;height:48px">
  <h1 style="font-size:18px">Appearance</h1>
  <div><button style="width:80px;height:32px">Reset</button><button style="width:80px;height:32px">Save</button></div>
</header>`),
  );
  await runCli("ui-audit", ["/unbound-topbar.html", "--base", `file://${scratch}`, "--out", reportPath], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(reportPath, "utf8")) as RelationalPopulationReport;
  expect(
    report.findings.map((finding) => finding.rule),
    "visual adjacency is not a label/control binding",
  ).not.toContain("row-void");
});
