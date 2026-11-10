// The DEVICE-PIXEL GRID census (#1031 item 1) — the last census with no integration pin.
//
// WHY IT NEEDS ONE AND WHY AT THIS TIER. Every decision this census makes is a RUNTIME product that
// authorship cannot see: `gridDeviceFrac` multiplies a CSS landing by the live `devicePixelRatio`,
// `gridPromotionOf` reads four computed-style shapes, `gridAnimating` asks the Web Animations API for a
// running/pending animation, and the exclusions (`readingSurface`, `snapped`, `compositedWithoutResample`) are the polarity ruling
// that keeps a per-paint-snapped baseline out of the numerator. None of it is reachable below the CLI.
//
// THE ACCOUNTING IS THE ASSERTION. Each arm below pins the whole population row — candidates, judged, and
// the named exclusion/withholding — rather than only the finding it emits: this census's founding risk is
// a denominator that silently shrinks (docs/law/integer-line-boxes.md §11, and #987's "an N/A cohort
// cannot silently disappear from the denominator").
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { AUDIT_ARGV, auditReport, configureRelationalCliBudget, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "@orb/testkit/node";
import { expect, test } from "@orb/testkit/tooling";
import { GRID_COMPOSITED_WITHOUT_RESAMPLE, GRID_INHERITED_LANDING } from "../../../../../tooling/src/ui-audit/lib/checks-grid.ts";

configureRelationalCliBudget();

interface GridReport {
  readonly findings: readonly { readonly rule: string; readonly value: string; readonly selector: string }[];
  readonly populationAccounting?: Readonly<
    Record<string, { readonly candidates: number; readonly judged: number; readonly excluded: Readonly<Record<string, number>> }>
  >;
}

/** One promoted host on the grid holding one text element offset by a quarter CSS pixel of its own — 16/64, so
 *  Chromium's LayoutUnit carries it exactly and the landing is the authored one rather than a rounding artefact. The
 *  offset is the text's, not the layer's: text that lands where its layer put it collapses into the layer's row. */
const LAW4_FIXTURE = `<style>
  .promo { will-change: transform; position: relative; top: 10px; }
  .promo p, .plain { margin: 0; }
  .promo p { position: relative; top: 0.25px; }
</style>
<div class="promo">
  <p class="inside">text inside a promoted layer</p>
  <div data-slot="message-bubble"><p>text on the reading surface</p></div>
</div>
<p class="plain">text with no promoting ancestor</p>`;

// The CLI drives Chromium only, where no promoted layer resamples its glyphs (docs/law/integer-line-boxes.md §10). So
// every case below proves the Chromium population; the judged arms outside Chromium are proved over real boxes by
// tests/tooling/design-audit-walker.ct.tsx and over the shipped string per engine by census-grid.test.ts.
test("in Chromium Law 4 EXCLUDES promoted text by name and counts all three exclusions into the same denominator", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "law4.html"), relationalDocument(LAW4_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "law4.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // THREE text candidates, NONE judged. `readingSurface` is the mirrored gate exemption, `snapped` is the polarity
  // ruling (no promoting ancestor = the browser re-snaps every paint) and `compositedWithoutResample` is §10's
  // measurement; all three are EXCLUSIONS — measured proof of inapplicability — so the verdict survives them.
  expect(res.stdout).toMatch(/POPULATION\s+off-grid-text candidates=3 judged=0 /u);
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");

  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as GridReport;
  expect(report.populationAccounting?.["off-grid-text"]?.excluded).toEqual({ [GRID_COMPOSITED_WITHOUT_RESAMPLE]: 1, readingSurface: 1, snapped: 1 });
  expect(report.findings.filter((finding) => finding.rule === "off-grid-text")).toEqual([]);
});

/** ONE promoted layer, THREE text nodes, at the SAME quarter-pixel landing — the only difference between
 *  them is whether the browser paints them. `.painted` is ordinary 13px text; `.clipped` is the app-wide
 *  `sr-only` posture (a real box the clip collapses); `.plumbing` is the sub-2px live-region box. Both
 *  sr-only shapes are the ones `srOnlyText` (ops/walker/core.ts) names, and both must leave the
 *  population as EXCLUDED `srOnly` — a node with no pixels cannot land off the device-pixel grid — before
 *  the promotion is asked, so the painted twin is the one that leaves as `compositedWithoutResample`. */
const SR_ONLY_FIXTURE = `<style>
  .promo { will-change: transform; position: relative; top: 10px; }
  .promo p { margin: 0; position: relative; top: 0.25px; }
  .clipped { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .plumbing { display: block; width: 1px; height: 1px; overflow: hidden; }
</style>
<div class="promo" data-slot="promoted-host">
  <p class="painted">painted text in the promoted layer</p>
  <span class="clipped">screen-reader-only status text</span>
  <span class="plumbing">x</span>
</div>`;

test("Law 4 EXCLUDES screen-reader-only text by its own reason, before the promotion is asked", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "sr-only.html"), relationalDocument(SR_ONLY_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "sr-only.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // PRINTED, never a silent drop: the excluded candidates stay in the denominator under their own
  // reasons, and the identity candidates = judged + withheld + excluded still closes.
  expect(res.stdout).toMatch(/POPULATION\s+off-grid-text candidates=3 judged=0 /u);
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");

  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as GridReport;
  // SERIALIZED, not only printed — the JSON is what a consumer reads.
  expect(report.populationAccounting?.["off-grid-text"]?.excluded, "the exclusions are carried in the report, not only in stdout").toEqual({
    srOnly: 2,
    [GRID_COMPOSITED_WITHOUT_RESAMPLE]: 1,
  });
});

/** The three composited shapes, one host each, so each disposition is proved by the emitted value rather than by
 *  a count that any of them could have produced.
 *
 *  EACH HOST CARRIES A `data-slot`, and that is load-bearing rather than decoration: `off-grid-text` is a
 *  rung-4 rule (`decisionPopulationFindings`) keyed on `authoredTarget + authoredHome`, and
 *  `authoredTargetHome` resolves to the nearest `data-slot` ancestor. Measured while writing this file —
 *  three slot-less hosts produced ONE finding reading "3 affected; 3 representative(s)", so two of the
 *  three kinds were invisible and the test read as a defect in `gridPromotionOf`. Distinct slots are
 *  three authored decisions, which is what the live tree looks like anyway. */
const PROMOTION_KIND_FIXTURE = `<style>
  .host { position: relative; top: 10px; }
  .host p { margin: 0; position: relative; top: 0.25px; }
  #backdrop { backdrop-filter: blur(2px); }
  #willchange { will-change: opacity; }
  #three-d { transform-style: preserve-3d; }
</style>
<div class="host" id="backdrop" data-slot="backdrop-host"><p>text under a backdrop filter</p></div>
<div class="host" id="willchange" data-slot="will-change-host"><p>text under will-change</p></div>
<div class="host" id="three-d" data-slot="preserve-3d-host"><p>text under preserve-3d</p></div>`;

test("in Chromium Law 4 EXCLUDES text under each of the three promotion shapes by name", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "promotion-kinds.html"), relationalDocument(PROMOTION_KIND_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "promotion-kinds.html"), ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });

  expect(res.stdout).toMatch(new RegExp(`POPULATION\\s+off-grid-text candidates=3 judged=0 .*excluded\\(${GRID_COMPOSITED_WITHOUT_RESAMPLE}=3\\)`, "u"));
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as GridReport;
  expect(
    report.findings.filter((finding) => finding.rule === "off-grid-text"),
    "no promoted layer resamples its glyphs in Chromium (§10)",
  ).toEqual([]);
});

/** Five promotion roots on the same quarter-pixel landing: backdrop-filter on the element, an absolute `::before`
 *  and an absolute `::after`, will-change, and a root carrying both. Each is a measured shape (§10). */
const LAW3_BACKDROP_FIXTURE = `<style>
  .root { position: relative; top: 10.25px; width: 120px; height: 20px; }
  #glass { backdrop-filter: blur(2px); }
  #glass-pseudo::before { content: ""; position: absolute; inset: 0; backdrop-filter: blur(2px); }
  #glass-after::after { content: ""; position: absolute; inset: 0; backdrop-filter: blur(2px); }
  #willchange { will-change: transform; }
  #both { backdrop-filter: blur(2px); will-change: transform; }
</style>
<div class="root" id="glass" data-slot="glass-root"></div>
<div class="root" id="glass-pseudo" data-slot="glass-pseudo-root"></div>
<div class="root" id="glass-after" data-slot="glass-after-root"></div>
<div class="root" id="willchange" data-slot="will-change-root"></div>
<div class="root" id="both" data-slot="both-root"></div>
<p>five promotion roots on one landing</p>`;

test("in Chromium Law 3 EXCLUDES every promotion root by name, element or pseudo, whatever its shape", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "law3-backdrop.html"), relationalDocument(LAW3_BACKDROP_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "law3-backdrop.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  expect(res.stdout).toMatch(
    new RegExp(`POPULATION\\s+promoted-layer-offset candidates=5 judged=0 .*excluded\\(${GRID_COMPOSITED_WITHOUT_RESAMPLE}=5\\)`, "u"),
  );
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as GridReport;
  expect(report.populationAccounting?.["promoted-layer-offset"]?.excluded[GRID_COMPOSITED_WITHOUT_RESAMPLE], "carried in the report, not only stdout").toBe(5);
  expect(report.findings.filter((finding) => finding.rule === "promoted-layer-offset")).toEqual([]);
});

/** An in-flow `::before` carrying backdrop-filter. Its backdrop edge changes with the landing (§10), so it is
 *  not excluded; its box cannot be derived from the host's rect, so it is withheld, as any in-flow pseudo is. */
const INFLOW_BACKDROP_FIXTURE = `<style>
  #strip { position: relative; top: 10.25px; width: 120px; }
  #strip::before { content: ""; display: block; height: 4px; backdrop-filter: blur(2px); }
</style>
<div id="strip" data-slot="glass-strip-root">text under a glass strip</div>`;

test("Law 3 WITHHOLDS an in-flow backdrop-filter pseudo by name, never excluding it", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "inflow-backdrop.html"), relationalDocument(INFLOW_BACKDROP_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "inflow-backdrop.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  expect(res.stdout).toMatch(/POPULATION\s+promoted-layer-offset candidates=1 judged=0 .*withheld\(pseudoBoxUnmeasurable=1\) excluded\(\)/u);
  await expect(res).toExitWith(2);
});

/** Rest transforms in frames on and off the device grid. A whole-pixel translation, as the individual property or in
 *  the matrix, inside a frame at a quarter pixel keeps the frame's landing and leaves the population by name. An
 *  authored half pixel in a frame on the grid, and a percentage the walker cannot read as a length, stay judged. */
const LAW2_INHERITED_FIXTURE = `<style>
  .frame { position: relative; width: 200px; height: 20px; }
  .fraction { left: 10.25px; }
  .whole { left: 10px; }
  .knob { width: 10px; height: 10px; }
  #property { translate: 16px; }
  #matrix { transform: translateX(16px); }
  #authored { translate: 0.5px; }
  #percent { width: 11px; translate: 50%; }
</style>
<div class="frame fraction" data-slot="property-frame"><div class="knob" id="property" data-slot="property-knob"></div></div>
<div class="frame fraction" data-slot="matrix-frame"><div class="knob" id="matrix" data-slot="matrix-knob"></div></div>
<div class="frame whole" data-slot="authored-frame"><div class="knob" id="authored" data-slot="authored-knob"></div></div>
<div class="frame fraction" data-slot="percent-frame"><div class="knob" id="percent" data-slot="percent-knob"></div></div>`;

test("Law 2 EXCLUDES a whole-pixel translation that keeps its frame's landing, and fires on an authored fraction", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "law2-inherited.html"), relationalDocument(LAW2_INHERITED_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "law2-inherited.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  expect(res.stdout).toMatch(new RegExp(`POPULATION\\s+off-grid-transform candidates=4 judged=2 .*excluded\\(${GRID_INHERITED_LANDING}=2\\)`, "u"));
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as GridReport;
  expect(report.populationAccounting?.["off-grid-transform"]?.excluded[GRID_INHERITED_LANDING], "carried in the report, not only stdout").toBe(2);
  const subjects = report.findings
    .filter((finding) => finding.rule === "off-grid-transform")
    .map((finding) => finding.selector)
    .join(" | ");
  expect(subjects).toContain("#authored");
  expect(subjects, "a percentage translation is not read as whole pixels").toContain("#percent");
  expect(subjects).not.toContain("#property");
  expect(subjects).not.toContain("#matrix");
});

/** A resting transform that is genuinely animating: `gridAnimating` asks the Web Animations API, and #987
 *  narrowed it to running/pending — a RETAINED FINISHED animation must not blind the subject forever. */
const ANIMATING_FIXTURE = `<style>
  @keyframes drift { from { transform: translateX(0.25px); } to { transform: translateX(4.25px); } }
  #moving { width: 80px; height: 20px; transform: translateX(0.25px); animation: drift 60s linear infinite; }
</style>
<div id="moving">drifting</div>`;

test("Law 2 WITHHOLDS a transform that is mid-animation — a moving element has no rest landing", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "animating.html"), relationalDocument(ANIMATING_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "animating.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // WITHHELD, not excluded: the rule APPLIES to this element and the instrument could not read its rest
  // landing, which is a NO VERDICT rather than a clean pass.
  expect(res.stdout).toMatch(/POPULATION\s+off-grid-transform candidates=1 judged=0 .*withheld\(animating=1\)/u);
  expect(res.stdout).toContain("rule population completeness is ABSENT");
  await expect(res).toExitWith(2);
});

/** A resting quarter-pixel translation in a frame on the grid: Law 2 judges it in Chromium, so it carries the
 *  landing that the DPR case below reads. */
const DPR_FIXTURE = `<style>
  .frame { position: relative; top: 10px; width: 200px; height: 20px; }
  #nudged { width: 20px; height: 10px; transform: translateY(0.25px); }
</style>
<div class="frame" data-slot="dpr-frame"><div id="nudged" data-slot="dpr-knob"></div></div>`;

/** ONE CSS offset, TWO device-pixel ratios. `gridDeviceFrac` multiplies by the live DPR before taking the
 *  fraction, which is the whole reason a single Node-side epsilon is correct at every DPR arm; a CSS-space
 *  reading would report the identical fraction on both runs. 10.25 CSS px = +0.25 device px at DPR 1 and
 *  30.75 = -0.25 at DPR 3, so the SIGN AND MAGNITUDE both move. Laws 2 to 4 share the one normalization.
 *
 *  STATED LIMIT: the textbook flip — a CSS half-pixel that is crisp at DPR 2 and off-grid at DPR 1 — is
 *  unreachable through this CLI. The only device arm is `--mobile` (iPhone 14 Pro Max, DPR 3), and under
 *  Chromium's 1/64 LayoutUnit the only CSS offsets that land crisp at DPR 3 are integers, which are crisp
 *  at DPR 1 too. Proving the multiplication is live is what IS reachable, and it is the property the
 *  epsilon rests on. */
test("the landing fraction is measured in DEVICE pixels, so the same CSS offset reads differently by DPR", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "dpr.html"), relationalDocument(DPR_FIXTURE));
  const desktop = await runCli("snap", ["--file", join(scratch, "dpr.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  const mobile = await runCli("snap", ["--file", join(scratch, "dpr.html"), "--mobile", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(desktop.stdout).not.toContain("INSTRUMENT ERROR");
  expect(mobile.stdout).not.toContain("INSTRUMENT ERROR");

  const desktopReport = JSON.parse(await readFile(auditReport(desktop.stdout), "utf8")) as GridReport;
  const mobileReport = JSON.parse(await readFile(auditReport(mobile.stdout), "utf8")) as GridReport;
  const desktopValue = desktopReport.findings.find((finding) => finding.rule === "off-grid-transform")?.value;
  const mobileValue = mobileReport.findings.find((finding) => finding.rule === "off-grid-transform")?.value;
  expect(desktopValue, "at DPR 1 a quarter-CSS-pixel offset is a quarter DEVICE pixel").toContain("top 0.250 / left 0.000 device px off the grid at DPR 1");
  expect(mobileValue, "at DPR 3 the same CSS offset is 30.75 device px — a quarter pixel the OTHER side of the grid line").toContain(
    "top -0.250 / left 0.000 device px off the grid at DPR 3",
  );
});
