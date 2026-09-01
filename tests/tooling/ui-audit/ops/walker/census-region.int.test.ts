// Adversarial region/surface controls for #984 through real visibility, paint, and authored ownership.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import type { RelationalPopulationReport } from "../../../../support/ui-audit-relational.ts";
import { RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

test("quiet-state refuses a global comparison between unrelated component families and backdrops", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "unrelated-states.html"),
    relationalDocument(`<section role="region" aria-label="Light family" style="background:#000;padding:12px">
  <span data-slot="checkbox-root" data-variant="quiet" data-unchecked style="display:block;width:48px;height:24px;background:#f5f5f5">off</span>
</section>
<section role="region" aria-label="Dark family" style="background:#000;padding:12px">
  <span data-slot="switch-root" data-variant="strong" data-checked style="display:block;width:48px;height:24px;background:#7a4a12">on</span>
</section>`),
  );
  const res = await runCli("ui-audit", ["/unrelated-states.html", "--base", `file://${scratch}`, "--fail-on", "P2"], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout, "two global extrema with no compatible authored cohort prove no state ordering").not.toContain("quiet-state");
});

test("independent labelled regions do not become one contradictory double-empty surface", async ({ runCli, scratch }) => {
  const empty = (label: string): string => `<section role="region" aria-label="${label}">
  <div data-slot="empty-state-root"><p>${label} is empty</p><div data-slot="empty-state-action"><button style="height:32px">Create</button></div></div>
</section>`;
  await writeFile(join(scratch, "independent-empty.html"), relationalDocument(`${empty("Library")}${empty("Queue")}`));
  const res = await runCli("ui-audit", ["/independent-empty.html", "--base", `file://${scratch}`, "--fail-on", "P2"], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout, "each declared region owns one actionable empty state").not.toContain("double-empty-state");
});

test("a hidden empty-state action is not an operable door out", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "hidden-empty-action.html"),
    relationalDocument(`<section role="region" aria-label="Library">
  <div data-slot="empty-state-root"><p>No books yet</p><div data-slot="empty-state-action" style="display:none"><button>Create</button></div></div>
</section>`),
  );
  const res = await runCli("ui-audit", ["/hidden-empty-action.html", "--base", `file://${scratch}`, "--fail-on", "P2"], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("double-empty-state");
  expect(res.stdout, "the hidden descendant must not clear the dead-end arm").toContain("1 with no action");
});

test("pane-ink counts bottom illustrations and composed controls as designed occupancy", async ({ runCli, scratch }) => {
  const reportPath = join(scratch, "designed-bottom-ink.json");
  await writeFile(
    join(scratch, "designed-bottom-ink.html"),
    relationalDocument(`<section role="region" aria-label="Editor" style="height:900px;overflow:hidden;position:relative">
  <p style="margin:0">one</p><p style="margin:0">two</p><p style="margin:0">three</p>
  <div style="position:absolute;top:650px"><svg aria-label="workflow illustration" role="img" width="80" height="80"><circle cx="40" cy="40" r="36" fill="orange" /></svg>
  <button aria-label="Compose" style="width:48px;height:48px"><svg aria-hidden="true" width="16" height="16"><path d="M8 1v14M1 8h14" /></svg></button></div>
</section>`),
  );
  await runCli("ui-audit", ["/designed-bottom-ink.html", "--base", `file://${scratch}`, "--out", reportPath], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(reportPath, "utf8")) as RelationalPopulationReport;
  expect(
    report.findings.map((finding) => finding.rule),
    "visible media and a composed control occupy the lower pane even though neither is a childless text leaf",
  ).not.toContain("pane-ink");
});
