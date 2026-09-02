// Adversarial region/surface controls for #984 through real visibility, paint, and authored ownership.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ToolFixtures } from "../../../../support/tool-fixtures.ts";
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
  expect(res.stdout, "two global extrema with no compatible authored cohort prove no state ordering").not.toMatch(/^P2\s+quiet-state/mu);
  expect(res.stdout).toContain("POPULATION   quiet-state candidates=2 judged=0 affected=0 populations=0 representatives=0");
  expect(res.stdout).toContain("unmatchedOff=1");
  expect(res.stdout).toContain("unmatchedOn=1");
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  expect(res.stdout).not.toContain("no findings — clean");
  await expect(res).toExitWith(2);
});

test("quiet-state counts a compatible resolved ON/OFF cohort as judged", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "paired-states.html"),
    relationalDocument(`<section role="region" aria-label="Switches" style="background:#000;padding:12px">
  <span data-slot="switch-root" data-variant="quiet" data-unchecked style="display:block;width:48px;height:24px;background:#222">off</span>
  <span data-slot="switch-root" data-variant="quiet" data-checked style="display:block;width:48px;height:24px;background:#f90">on</span>
</section>`),
  );
  const res = await runCli("ui-audit", ["/paired-states.html", "--base", `file://${scratch}`], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  expect(res.stdout).toContain("POPULATION   quiet-state candidates=1 judged=1 affected=0 populations=0 representatives=0");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

// #1068 — THE PARTITION MUST BE INDEPENDENT OF THE AXIS IT PARTITIONS. quiet-state groups an authored
// cohort by `claim + authoredTargetHome` (#1059's key) and then splits it again by RESOLVED BACKDROP so a
// comparison never crosses paint contexts. On every state carrier whose own state PAINTS — a Base UI
// switch track under its thumb, a selected list row under its checkbox — that second split is a
// restatement of the state axis, so the cohort could only ever come out one-sided. The four controls
// below pin both directions: a state-painted context folds, a genuinely different one still splits.

test("quiet-state does not split a sub-part cohort by the state its own carrier paints", async ({ runCli, scratch }) => {
  // The live Settings -> Appearance shape: `switch-thumb`'s nearest opaque ancestor IS `switch-root`,
  // whose fill is the ON/OFF track. Partitioning on it put the three ON thumbs and the seven OFF thumbs
  // in different partitions of one authored cohort — `withheld(unmatchedOn=1 unmatchedOff=1)`, a
  // permanent NO VERDICT for a pair rendered side by side on screen.
  await writeFile(
    join(scratch, "state-painted-context.html"),
    relationalDocument(`<section role="region" aria-label="Switches" style="background:#000;padding:12px">
  <span data-slot="switch-root" data-checked style="display:block;width:48px;height:24px;background:#f90">
    <span data-slot="switch-thumb" data-checked style="display:block;width:20px;height:20px;background:#3a1d00"></span>
  </span>
  <span data-slot="switch-root" data-unchecked style="display:block;width:48px;height:24px;background:#222">
    <span data-slot="switch-thumb" data-unchecked style="display:block;width:20px;height:20px;background:#555"></span>
  </span>
</section>`),
  );
  const res = await runCli("ui-audit", ["/state-painted-context.html", "--base", `file://${scratch}`], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("POPULATION   quiet-state candidates=2 judged=2 affected=0 populations=0 representatives=0 withheld() excluded()");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
  await expect(res).toExitWith(0);
});

test("quiet-state does not split a cohort by the selection tint of its own container", async ({ runCli, scratch }) => {
  // The live Characters bulk-mode shape: the checked row's `[data-slot=list-row-root][data-selected]`
  // carries a 10% ember tint, so one authored cohort of ten row checkboxes resolved two backdrops and
  // withheld both halves.
  await writeFile(
    join(scratch, "tinted-container.html"),
    relationalDocument(`<section role="region" aria-label="Rows" style="background:#000;padding:12px">
  <div data-slot="list-row-root" data-selected style="background:#40260a;padding:6px">
    <span data-slot="checkbox-root" data-checked style="display:block;width:24px;height:24px;background:#f90"></span>
  </div>
  <div data-slot="list-row-root" style="background:#000;padding:6px">
    <span data-slot="checkbox-root" data-unchecked style="display:block;width:24px;height:24px;background:#333"></span>
  </div>
</section>`),
  );
  const res = await runCli("ui-audit", ["/tinted-container.html", "--base", `file://${scratch}`], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("POPULATION   quiet-state candidates=1 judged=1 affected=0 populations=0 representatives=0 withheld() excluded()");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
  await expect(res).toExitWith(0);
});

test("quiet-state still splits one authored cohort across genuinely different paint contexts", async ({ runCli, scratch }) => {
  // ANTI-COLLAPSE FENCE (green before and after #1068, deliberately): the same authored component in two
  // differently-painted panels is still two paint contexts, because neither panel's fill is a state.
  await writeFile(
    join(scratch, "distinct-contexts.html"),
    relationalDocument(`<section role="region" aria-label="Panels" style="padding:12px">
  <div data-slot="panel" style="background:#000;padding:8px">
    <span data-slot="switch-root" data-checked style="display:block;width:48px;height:24px;background:#f90">on</span>
  </div>
  <div data-slot="panel" style="background:#fff;padding:8px">
    <span data-slot="switch-root" data-unchecked style="display:block;width:48px;height:24px;background:#222">off</span>
  </div>
</section>`),
  );
  const res = await runCli("ui-audit", ["/distinct-contexts.html", "--base", `file://${scratch}`], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("POPULATION   quiet-state candidates=2 judged=0 affected=0 populations=0 representatives=0");
  expect(res.stdout).toContain("unmatchedOn=1");
  expect(res.stdout).toContain("unmatchedOff=1");
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  await expect(res).toExitWith(2);
});

test("quiet-state records a cohort that paints no fill of its own as a closed exclusion", async ({ runCli, scratch }) => {
  // A `checkbox-indicator` is a transparent glyph host: it has no fill, so it has no loudness to rank and
  // the ordering rule does not apply to it. That is complete evidence (`excluded`), not the missing
  // measurement `withheld(unresolved)` recorded it as — which alone made the driven Characters run a
  // NO VERDICT after the two cohorts above were repaired.
  await writeFile(
    join(scratch, "fill-less-cohort.html"),
    relationalDocument(`<section role="region" aria-label="Indicators" style="background:#000;padding:12px">
  <span data-slot="checkbox-root" data-checked style="display:block;width:24px;height:24px;background:#f90">
    <span data-slot="checkbox-indicator" data-checked style="display:block;width:12px;height:12px;background:transparent"></span>
  </span>
  <span data-slot="checkbox-root" data-unchecked style="display:block;width:24px;height:24px;background:#333"></span>
</section>`),
  );
  const res = await runCli("ui-audit", ["/fill-less-cohort.html", "--base", `file://${scratch}`], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout).toContain("POPULATION   quiet-state candidates=2 judged=1 affected=0 populations=0 representatives=0 withheld() excluded(noOwnFill=1)");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
  await expect(res).toExitWith(0);
});

test("independent labelled regions do not become one contradictory double-empty surface", async ({ runCli, scratch }) => {
  const empty = (label: string): string => `<section role="region" aria-label="${label}">
  <div data-slot="empty-state-root"><p>${label} is empty</p><div data-slot="empty-state-action"><button style="height:32px">Create</button></div></div>
</section>`;
  await writeFile(join(scratch, "independent-empty.html"), relationalDocument(`${empty("Library")}${empty("Queue")}`));
  const res = await runCli("ui-audit", ["/independent-empty.html", "--base", `file://${scratch}`, "--fail-on", "P2"], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(res.stdout, "each declared region owns one actionable empty state").not.toMatch(/^P2\s+double-empty-state/mu);
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

async function runPaneExclusionFixture(
  reason: "insufficientText" | "scrolling",
  body: string,
  runCli: ToolFixtures["runCli"],
  scratch: string,
): Promise<{ readonly report: RelationalPopulationReport; readonly stdout: string; readonly code: number | null }> {
  const reportPath = join(scratch, `pane-${reason}.json`);
  await writeFile(join(scratch, `pane-${reason}.html`), relationalDocument(body));
  const res = await runCli("ui-audit", [`/pane-${reason}.html`, "--base", `file://${scratch}`, "--out", reportPath], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(reportPath, "utf8")) as RelationalPopulationReport;
  return { report, stdout: res.stdout, code: res.code };
}

test("pane-ink records the closed scrolling applicability carve without poisoning the audit", async ({ runCli, scratch }) => {
  const result = await runPaneExclusionFixture(
    "scrolling",
    `<section role="region" aria-label="Scrollable log" style="height:400px;overflow:auto"><div style="height:800px"><p>one</p><p>two</p><p>three</p></div></section>`,
    runCli,
    scratch,
  );
  expect(result.report.populationAccounting?.["pane-ink"]).toMatchObject({ candidates: 1, judged: 0, withheld: {}, excluded: { scrolling: 1 } });
  expect(result.stdout).not.toContain("INSTRUMENT ERROR");
  expect(result.code).toBe(0);
});

test("pane-ink records the closed insufficient-text applicability carve without poisoning the audit", async ({ runCli, scratch }) => {
  const result = await runPaneExclusionFixture(
    "insufficientText",
    `<section role="region" aria-label="Sparse tool" style="height:500px;overflow:hidden"><p>one line</p><button style="height:44px">Run</button></section>`,
    runCli,
    scratch,
  );
  expect(result.report.populationAccounting?.["pane-ink"]).toMatchObject({
    candidates: 1,
    judged: 0,
    withheld: {},
    excluded: { insufficientText: 1 },
  });
  expect(result.stdout).not.toContain("INSTRUMENT ERROR");
  expect(result.code).toBe(0);
});
