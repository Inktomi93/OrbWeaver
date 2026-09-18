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

// COHORT ANATOMY IS A QUESTION ABOUT BOXES, AND AN INLINE TEXT RUN HAS NO BOX (#1703).
//
// `getBoundingClientRect` on a `display: inline` element returns the UNION of its line boxes, so the
// "height" the census recorded for one was a LINE-WRAP COUNT that moves with the viewport. Measured live on
// Characters (side-eye #844): one `span[data-slot=dialogue]` cohort — the quoted-speech runs `@orb/ui`'s
// markdown emits (packages/ui/src/markdown/dialogue-paragraph.tsx:54,71) — reported 69/45px desktop,
// 45/21px Light and 21/45px mobile-coarse, i.e. the majority and the minority TRADE PLACES between arms
// for byte-identical markup. The rule's premise is "one component, two anatomies"; prose reflowing is not
// that, and a finding that inverts with the viewport is a mechanism mismatch per tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md.
//
// Both directions in ONE fixture, because the failure mode of a fence is a false clean: the wrapped prose
// cohort goes silent and is PRINTED as `excluded(inlineTextRun)`, while a block cohort carrying the config
// surface's own P0 spread (a 16px outlier against a 32px mode) must still fire in the same run.

/** A narrow measure with a fixed monospace line box, so the wrap counts are deterministic rather than
 *  font-metric-dependent: the long quoted run occupies several line boxes and its two siblings one each. */
const INLINE_COHORT_CSS = "p.measure { width: 220px; margin: 0; font: 14px/21px monospace }";

/** Three block members of one component, each holding an identically-sized child so the
 *  content-explains-the-box discriminator cannot absolve the short one. */
const BLOCK_COHORT_CSS = "#rows > div { display: block; width: 200px } #rows i { display: block; height: 8px; background: #444 }";

test("cohort-anatomy excludes a cohort of inline prose runs and still judges a block cohort in the same run", async ({ runCli, scratch }) => {
  await writeFile(
    join(scratch, "inline-run-cohort.html"),
    relationalDocument(`<style>${INLINE_COHORT_CSS} ${BLOCK_COHORT_CSS}</style>
<p class="measure"><span data-slot="dialogue">"a long quoted speech run that has to wrap across several line boxes before it ends"</span> he said, <span data-slot="dialogue">"short"</span> then <span data-slot="dialogue">"brief"</span></p>
<div id="rows">
  <div data-slot="config-row" style="height:32px"><i></i></div>
  <div data-slot="config-row" style="height:32px"><i></i></div>
  <div data-slot="config-row" style="height:16px"><i></i></div>
</div>`),
  );
  const res = await runCli("snap", ["--file", join(scratch, "inline-run-cohort.html"), ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as RelationalPopulationReport;
  // BOTH cohorts are candidates: the prose one is excluded with a reason, not dropped, so widening this
  // fence shows up in the denominator rather than as a quieter clean run.
  expect(report.populationAccounting?.["cohort-anatomy"]).toMatchObject({ candidates: 2, judged: 1, withheld: {}, excluded: { inlineTextRun: 1 } });
  expect(res.stdout).toContain("excluded(inlineTextRun=1)");
  // FIRES: the block cohort is the rule's real target and survives the fence.
  expect(
    report.findings.map(({ rule }) => rule),
    `the block cohort must still be judged:\n${res.stdout}`,
  ).toContain("cohort-anatomy");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});
