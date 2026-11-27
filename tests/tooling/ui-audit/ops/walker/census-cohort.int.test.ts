// Adversarial row-binding control for #984 through the shipped CLI and real Chromium geometry.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AUDIT_ARGV, configureRelationalCliBudget, RELATIONAL_CLI_TIMEOUT_MS, readAuditReport, relationalDocument } from "@orb/testkit/node";
import { auditRuleTest, expect, test } from "@orb/testkit/tooling";

configureRelationalCliBudget();

test("row-void rejects an unbound title/actions topbar even when its rendered gap is enormous", async ({ runSnap, scratch }) => {
  await writeFile(
    join(scratch, "unbound-topbar.html"),
    relationalDocument(`<header style="display:flex;justify-content:space-between;align-items:center;width:1000px;height:48px">
  <h1 style="font-size:18px">Appearance</h1>
  <div><button style="width:80px;height:32px">Reset</button><button style="width:80px;height:32px">Save</button></div>
</header>`),
  );
  const res = await runSnap(["--file", join(scratch, "unbound-topbar.html"), ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const report = await readAuditReport(res.stdout);
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

test("cohort-anatomy withholds an actively animating cohort instead of counting it judged", async ({ runSnap, scratch }) => {
  await writeFile(
    join(scratch, "animating-cohort.html"),
    relationalDocument(`<style>@keyframes hold { from { opacity:.99 } to { opacity:1 } }</style><section>
  <div data-slot="setting-row" style="height:32px;animation:hold 60s infinite">a</div>
  <div data-slot="setting-row" style="height:32px">b</div>
  <div data-slot="setting-row" style="height:16px">c</div>
</section>`),
  );
  const res = await runSnap(["--file", join(scratch, "animating-cohort.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  const report = await readAuditReport(res.stdout);
  expect(report.populationAccounting?.["cohort-anatomy"]).toMatchObject({ candidates: 1, judged: 0, withheld: { animating: 1 } });
  expect(report.findings.map(({ rule }) => rule)).not.toContain("cohort-anatomy");
  expect(res.stdout).toContain("INSTRUMENT ERROR");
  await expect(res).toExitWith(2);
});

test("cohort-anatomy judges a retained animation after its play state is finished", async ({ runSnap, scratch }) => {
  await writeFile(
    join(scratch, "finished-cohort.html"),
    relationalDocument(`<style>@keyframes done { from { opacity:.99 } to { opacity:1 } }</style><section>
  <div data-slot="setting-row" style="height:32px;animation:done 1ms forwards">a</div>
  <div data-slot="setting-row" style="height:32px">b</div>
  <div data-slot="setting-row" style="height:32px">c</div>
</section>`),
  );
  const res = await runSnap(["--file", join(scratch, "finished-cohort.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  const report = await readAuditReport(res.stdout);
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

test("cohort-anatomy excludes a cohort of inline prose runs and still judges a block cohort in the same run", async ({ runSnap, scratch }) => {
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
  const res = await runSnap(["--file", join(scratch, "inline-run-cohort.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  const report = await readAuditReport(res.stdout);
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

// A member that STACKS its children holds all of them: an open group is its band plus its body, so its content is the
// children's summed heights, not its tallest child. Two near-misses in the same run stack children that match the
// collapsed members' content inside a taller box, which is the mis-sized member the rule exists for: one is padded and
// carries an out-of-flow marker far below that sizes nothing; the other opens a stray top margin between its stacked
// children, and a gap between children is not content, so neither may stretch into an excuse.
const STACKED_COHORT_CSS = ".stack > div { display: block; width: 200px } .stack i { display: block; background: #444 }";
const stackedCohort = (slot: string, outlierStyle: string, outlier: string): string => `<div class="stack">
  <div data-slot="${slot}"><i style="height:32px"></i></div>
  <div data-slot="${slot}"><i style="height:32px"></i></div>
  <div data-slot="${slot}"><i style="height:32px"></i></div>
  <div data-slot="${slot}" style="${outlierStyle}">${outlier}</div>
</div>`;

test("cohort-anatomy reads a stacking member's content as its summed child heights and still reports a padded or gapped one", async ({ runSnap, scratch }) => {
  await writeFile(
    join(scratch, "stacked-cohort.html"),
    relationalDocument(`<style>${STACKED_COHORT_CSS}</style>
${stackedCohort("open-group", "", '<i style="height:32px"></i><i style="height:80px"></i>')}
${stackedCohort(
  "padded-group",
  "padding-bottom:32px;position:relative",
  '<i style="height:16px"></i><i style="height:16px"></i><i style="position:absolute;top:200px;width:8px;height:8px"></i>',
)}
${stackedCohort("gapped-group", "", '<i style="height:16px"></i><i style="height:16px;margin-top:32px"></i>')}`),
  );
  const res = await runSnap(["--file", join(scratch, "stacked-cohort.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  const report = await readAuditReport(res.stdout);
  expect(report.populationAccounting?.["cohort-anatomy"]).toMatchObject({ candidates: 3, judged: 3, withheld: {}, excluded: {} });
  expect(
    report.findings.filter(({ rule }) => rule === "cohort-anatomy"),
    `only the padded and the gapped members are mis-sized:\n${res.stdout}`,
  ).toHaveLength(2);
  expect(res.stdout).toMatch(/FINDING .*cohort-anatomy: .*slot=padded-group/u);
  expect(res.stdout).toMatch(/FINDING .*cohort-anatomy: .*slot=gapped-group/u);
  expect(res.stdout).not.toMatch(/FINDING .*cohort-anatomy: .*slot=open-group/u);
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

// The `Text` primitive is not a row anatomy: an avatar's initial, a name and a gloss share its slot and owe no common
// height, so a row of them proves nothing. A component with a height of its own, in the same run, still reports.
const threeInARow = (slot: string, id: string): string => `<div id="${id}" style="display:flex;gap:8px;align-items:flex-start">
  <span data-slot="${slot}" data-size="body" style="display:flex;width:40px;height:40px">A</span>
  <span data-slot="${slot}" data-size="body" style="display:flex;width:120px;height:16px">Name</span>
  <span data-slot="${slot}" data-size="body" style="display:flex;width:120px;height:40px">A gloss of two lines</span>
</div>`;

auditRuleTest(
  [
    {
      rule: "cohort-anatomy",
      kind: "silent",
      reason: "three Text primitives in one row are an avatar, a name and a gloss: one primitive, three jobs",
      disposition: { kind: "excluded", reason: "textPrimitive" },
    },
    {
      rule: "cohort-anatomy",
      kind: "fires",
      reason: "the same heights on a component that claims one anatomy are the rule's real target",
    },
  ],
  "a row of Text primitives is no cohort, and the same heights on a real component still report",
  async ({ runSnap, scratch }) => {
    await writeFile(join(scratch, "text-row.html"), relationalDocument(`${threeInARow("text", "text-row")}${threeInARow("band", "band-row")}`));
    const res = await runSnap(["--file", join(scratch, "text-row.html"), ...AUDIT_ARGV], {
      timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
    });
    const report = await readAuditReport(res.stdout);
    expect(report.findings.filter(({ rule }) => rule === "cohort-anatomy")).toHaveLength(1);
    return report;
  },
);

// A DISCLOSURE WRAPPER IS NOT THE ROW: the cohort rule measures the band that owns the toggle, never the group
// frame around it. The frame holds the band plus an optional body, so an open group is taller by design, and a
// band of the wrong height inside a frame is hidden by that same band-or-body content. Both directions run against
// the shape the settings list renders: a frame whose first child is the toggle and whose second is the body it
// controls.
const DISCLOSURE_CSS = `.groups > div { display: flex; flex-direction: column; width: 240px }
.groups button { display: block; height: 32px; padding: 0; border: 0 }
.groups .body { margin-block-start: 40px }
.groups .body i { display: block; height: 28px; background: #444 }`;
const disclosureGroup = (id: string, bandStyle: string, open: boolean): string => `<div data-slot="config-group">
  <button type="button" aria-expanded="${String(open)}" aria-controls="${id}" style="${bandStyle}">Group ${id}</button>
  <div id="${id}" class="body"${open ? "" : " hidden"}>${open ? "<i></i><i></i><i></i>" : ""}</div>
</div>`;

test("cohort-anatomy measures each band, so an open disclosure group is no finding", async ({ runSnap, scratch }) => {
  await writeFile(
    join(scratch, "open-disclosure.html"),
    relationalDocument(`<style>${DISCLOSURE_CSS}</style><div class="groups">
${disclosureGroup("a", "", true)}${disclosureGroup("b", "", false)}${disclosureGroup("c", "", false)}${disclosureGroup("d", "", false)}
</div>`),
  );
  const res = await runSnap(["--file", join(scratch, "open-disclosure.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  const report = await readAuditReport(res.stdout);
  expect(report.populationAccounting?.["cohort-anatomy"]).toMatchObject({ candidates: 1, judged: 1, withheld: {} });
  expect(
    report.findings.filter(({ rule }) => rule === "cohort-anatomy"),
    `an open group is its band plus its body, not a mis-sized row:\n${res.stdout}`,
  ).toHaveLength(0);
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});

test("cohort-anatomy still reports a band of the wrong height inside its disclosure group", async ({ runSnap, scratch }) => {
  await writeFile(
    join(scratch, "tall-band.html"),
    relationalDocument(`<style>${DISCLOSURE_CSS}</style><div class="groups">
${disclosureGroup("a", "", false)}${disclosureGroup("b", "", false)}${disclosureGroup("c", "", false)}${disclosureGroup("d", "height:48px", false)}
</div>`),
  );
  const res = await runSnap(["--file", join(scratch, "tall-band.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  const report = await readAuditReport(res.stdout);
  const findings = report.findings.filter(({ rule }) => rule === "cohort-anatomy");
  expect(findings, `the 48px band is the planted defect:\n${res.stdout}`).toHaveLength(1);
  expect(res.stdout).toContain("1 of 4 at 48px, 3 at 32px");
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
});
