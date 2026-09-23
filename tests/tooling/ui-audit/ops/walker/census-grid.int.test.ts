// The DEVICE-PIXEL GRID census (#1031 item 1) — the last census with no integration pin.
//
// WHY IT NEEDS ONE AND WHY AT THIS TIER. Every decision this census makes is a RUNTIME product that
// authorship cannot see: `gridDeviceFrac` multiplies a CSS landing by the live `devicePixelRatio`,
// `gridPromotionKind` reads four computed-style shapes, `gridAnimating` asks the Web Animations API for a
// running/pending animation, and the two exclusions (`readingSurface`, `snapped`) are the polarity ruling
// that keeps a per-paint-snapped baseline out of the numerator. None of it is reachable below the CLI.
//
// THE ACCOUNTING IS THE ASSERTION. Each arm below pins the whole population row — candidates, judged, and
// the named exclusion/withholding — rather than only the finding it emits: this census's founding risk is
// a denominator that silently shrinks (docs/law/integer-line-boxes.md §11, and #987's "an N/A cohort
// cannot silently disappear from the denominator").
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { AUDIT_ARGV, auditReport, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

interface GridReport {
  readonly findings: readonly { readonly rule: string; readonly value: string; readonly selector: string }[];
  readonly populationAccounting?: Readonly<
    Record<string, { readonly candidates: number; readonly judged: number; readonly excluded: Readonly<Record<string, number>> }>
  >;
}

/** One promoted host holding one text element, offset by a quarter CSS pixel — 16/64, so Chromium's
 *  LayoutUnit carries it exactly and the landing is the authored one rather than a rounding artefact. */
const LAW4_FIXTURE = `<style>
  .promo { will-change: transform; position: relative; top: 10.25px; }
  .promo p, .plain { margin: 0; }
</style>
<div class="promo">
  <p class="inside">text inside a promoted layer</p>
  <div data-slot="message-bubble"><p>text on the reading surface</p></div>
</div>
<p class="plain">text with no promoting ancestor</p>`;

test("Law 4 judges promoted text and counts BOTH exclusions into the same denominator", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "law4.html"), relationalDocument(LAW4_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "law4.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // THREE text candidates, ONE judged. `readingSurface` is the mirrored gate exemption and `snapped` is the
  // polarity ruling (no promoting ancestor = the browser re-snaps every paint = the rule does not apply);
  // both are EXCLUSIONS — measured proof of inapplicability — so the verdict survives them.
  expect(res.stdout).toMatch(/POPULATION\s+off-grid-text candidates=3 judged=1 .*excluded\(readingSurface=1 snapped=1\)/u);
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");

  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as GridReport;
  const law4 = report.findings.filter((finding) => finding.rule === "off-grid-text");
  expect(law4, "the promoted text is the one candidate the rule applies to").toHaveLength(1);
  // The finding must name the LAYER KIND (`gridPromotionKind`) and the fraction in DEVICE px at the live
  // DPR — the repair address is the promoting ancestor, not the text.
  expect(law4[0]?.value).toContain("inside a will-change layer");
  expect(law4[0]?.value).toContain("at DPR 1");
});

/** ONE promoted layer, THREE text nodes, at the SAME quarter-pixel landing — the only difference between
 *  them is whether the browser paints them. `.painted` is ordinary 13px text; `.clipped` is the app-wide
 *  `sr-only` posture (a real box the clip collapses); `.plumbing` is the sub-2px live-region box. Both
 *  sr-only shapes are the ones `srOnlyText` (ops/walker/core.ts) names, and both must leave the
 *  population as EXCLUDED — a node with no pixels cannot land off the device-pixel grid — while the
 *  painted twin in the SAME layer at the SAME offset still fires. The pair IS the control: a fix that
 *  merely stopped judging text in this layer would take the painted one with it. */
const SR_ONLY_FIXTURE = `<style>
  .promo { will-change: transform; position: relative; top: 10.25px; }
  .promo p { margin: 0; }
  .clipped { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .plumbing { display: block; width: 1px; height: 1px; overflow: hidden; }
</style>
<div class="promo" data-slot="promoted-host">
  <p class="painted">painted text in the promoted layer</p>
  <span class="clipped">screen-reader-only status text</span>
  <span class="plumbing">x</span>
</div>`;

test("Law 4 EXCLUDES screen-reader-only text and still judges its painted twin in the same layer", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "sr-only.html"), relationalDocument(SR_ONLY_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "sr-only.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // PRINTED, never a silent drop: the two excluded candidates stay in the denominator under their own
  // reason, and the identity candidates = judged + withheld + excluded still closes.
  expect(res.stdout).toMatch(/POPULATION\s+off-grid-text candidates=3 judged=1 .*excluded\(srOnly=2\)/u);
  expect(res.stdout).not.toContain("INSTRUMENT ERROR");

  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as GridReport;
  // SERIALIZED, not only printed — the JSON is what a consumer reads.
  const row = report.populationAccounting?.["off-grid-text"];
  expect(row?.excluded["srOnly"], "the exclusion is carried in the report, not only in stdout").toBe(2);
  expect(row?.judged).toBe(1);

  const law4 = report.findings.filter((finding) => finding.rule === "off-grid-text");
  expect(law4, "the painted twin at the same landing is still a finding").toHaveLength(1);
  expect(law4[0]?.value).toContain("14px text");
  expect(law4[0]?.selector, "the sr-only nodes must not be the subject").not.toContain("clipped");
});

/** The three shapes Law 3 names, one host each, so the KIND is proved by the emitted value rather than by
 *  a count that any of them could have produced.
 *
 *  EACH HOST CARRIES A `data-slot`, and that is load-bearing rather than decoration: `off-grid-text` is a
 *  rung-4 rule (`decisionPopulationFindings`) keyed on `authoredTarget + authoredHome`, and
 *  `authoredTargetHome` resolves to the nearest `data-slot` ancestor. Measured while writing this file —
 *  three slot-less hosts produced ONE finding reading "3 affected; 3 representative(s)", so two of the
 *  three kinds were invisible and the test read as a defect in `gridPromotionKind`. Distinct slots are
 *  three authored decisions, which is what the live tree looks like anyway. */
const PROMOTION_KIND_FIXTURE = `<style>
  .host { position: relative; top: 10.25px; }
  .host p { margin: 0; }
  #backdrop { backdrop-filter: blur(2px); }
  #willchange { will-change: opacity; }
  #three-d { transform-style: preserve-3d; }
</style>
<div class="host" id="backdrop" data-slot="backdrop-host"><p>text under a backdrop filter</p></div>
<div class="host" id="willchange" data-slot="will-change-host"><p>text under will-change</p></div>
<div class="host" id="three-d" data-slot="preserve-3d-host"><p>text under preserve-3d</p></div>`;

test("Law 3 recognises all three promotion shapes and names each one in its Law-4 finding", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "promotion-kinds.html"), relationalDocument(PROMOTION_KIND_FIXTURE));
  const res = await runCli("snap", ["--file", join(scratch, "promotion-kinds.html"), ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });

  expect(res.stdout).toMatch(/POPULATION\s+off-grid-text candidates=3 judged=3 /u);
  const report = JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as GridReport;
  const kinds = report.findings.filter((finding) => finding.rule === "off-grid-text").map((finding) => finding.value);
  for (const kind of ["backdrop-filter", "will-change", "3d"]) {
    expect(
      kinds.some((value) => value.includes(`inside a ${kind} layer`)),
      `${kind} is one of the three shapes Law 3 names`,
    ).toBe(true);
  }
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

/** ONE CSS offset, TWO device-pixel ratios. `gridDeviceFrac` multiplies by the live DPR before taking the
 *  fraction, which is the whole reason a single Node-side epsilon is correct at every DPR arm; a CSS-space
 *  reading would report the identical fraction on both runs. 10.25 CSS px = +0.25 device px at DPR 1 and
 *  30.75 = -0.25 at DPR 3, so the SIGN AND MAGNITUDE both move.
 *
 *  STATED LIMIT: the textbook flip — a CSS half-pixel that is crisp at DPR 2 and off-grid at DPR 1 — is
 *  unreachable through this CLI. The only device arm is `--mobile` (iPhone 14 Pro Max, DPR 3), and under
 *  Chromium's 1/64 LayoutUnit the only CSS offsets that land crisp at DPR 3 are integers, which are crisp
 *  at DPR 1 too. Proving the multiplication is live is what IS reachable, and it is the property the
 *  epsilon rests on. */
test("the landing fraction is measured in DEVICE pixels, so the same CSS offset reads differently by DPR", async ({ runCli, scratch }) => {
  await writeFile(join(scratch, "dpr.html"), relationalDocument(LAW4_FIXTURE));
  const desktop = await runCli("snap", ["--file", join(scratch, "dpr.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  const mobile = await runCli("snap", ["--file", join(scratch, "dpr.html"), "--mobile", ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  expect(desktop.stdout).not.toContain("INSTRUMENT ERROR");
  expect(mobile.stdout).not.toContain("INSTRUMENT ERROR");

  const desktopReport = JSON.parse(await readFile(auditReport(desktop.stdout), "utf8")) as GridReport;
  const mobileReport = JSON.parse(await readFile(auditReport(mobile.stdout), "utf8")) as GridReport;
  const desktopValue = desktopReport.findings.find((finding) => finding.rule === "off-grid-text")?.value;
  const mobileValue = mobileReport.findings.find((finding) => finding.rule === "off-grid-text")?.value;
  expect(desktopValue, "at DPR 1 a quarter-CSS-pixel offset is a quarter DEVICE pixel").toContain("top 0.250 / left 0.000 device px off the grid at DPR 1");
  expect(mobileValue, "at DPR 3 the same CSS offset is 30.75 device px — a quarter pixel the OTHER side of the grid line").toContain(
    "top -0.250 / left 0.000 device px off the grid at DPR 3",
  );
});
