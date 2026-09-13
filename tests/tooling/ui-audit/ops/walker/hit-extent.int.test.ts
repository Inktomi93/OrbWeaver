// @instrument-proof: ONE DEFINITION OF THE EFFECTIVE TAP TARGET (#1678). The house has two
// implementations of "how big is this control really", and a row asked whether they disagree:
//
//   · design-audit's walker — `ops/walker/hit-extent.ts`: an `elementFromPoint` RING at half-extents
//     [11, 12, 16, 22], published as `2 x radius`, with ancestor credit allowed only INSIDE a measured
//     outward pseudo rect, or for a visually-hidden control (`ancestorCreditAt`).
//   · the CT kit — `tests/support/iso/hit-extent-walk.ts`, run by `tests/support/browser/touch-floor.ts`
//     `hitExtent`: a 1px outward WALK per axis, owning a point when `hit === el || el.contains(hit)`, or
//     when the point lies inside the same measured pseudo rect and the hit CONTAINS the control.
//
// THE ROW'S PREMISE — "the auditor judges the BORDER BOX" — is REFUTED by these arms: on the shape the
// rpg Status card actually ships after #869 (a text-height value whose 44px coarse target rides an
// overflowing `::after`, inside a row that carries the coarse floor so two pseudos cannot overlap), the
// auditor publishes the PSEUDO's extent and reports nothing. What it does report is a control with no
// floor at all — which is the same answer the CT walk gives. Both directions are pinned here, and the
// third arm runs the CT kit's own ownership predicate inside the audited page in the SAME run, so the
// agreement is measured rather than asserted from two separate runs.
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { WALKER_HIT_EXTENT } from "../../../../../tooling/src/ui-audit/ops/walker/hit-extent.ts";
import { HIT_EXTENT_WALK_SOURCE, PSEUDO_ENVELOPE_SOURCE } from "../../../../support/iso/hit-extent-walk.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import { AUDIT_ARGV, auditReport, RELATIONAL_CLI_TIMEOUT_MS } from "../../../../support/ui-audit-relational.ts";

/** The shipped shape, reduced to its mechanism: `.value` is text-height and carries a pointer-conditional
 *  44px `::after`; `.row` takes the coarse floor so stacked pseudos have room (the #869 fix). `.bare` is
 *  the same text-height box with NEITHER — a genuine sub-target.
 *
 *  `.ringed` is the #2300 NEGATIVE CONTROL — the pre-#1843 `data-cta` glyph button, rebuilt from the
 *  cascade that produced it. The hit area was an `::after` (`glyphBox` at 183e49714:
 *  `after:absolute after:top-1/2 after:left-1/2 after:size-touch-target after:-translate-*`) and so is the
 *  CTA gradient ring (`globals.css [data-slot="button"][data-cta]::after`), which is UNLAYERED and
 *  therefore wins PER PROPERTY: `inset`/`pointer-events` come from the ring, while the utilities'
 *  `width`/`height`/`translate` SURVIVE. So the pseudo still describes an outward rect and a geometry-only
 *  eligibility test would credit it — what disqualifies it is that no pointer can ever reach it. Both
 *  readers must report this control as a sub-target; the pre-fix predicate reported the full floor for it
 *  (measured 161x161 through the CT walk in an isolated stage, for a 26x26 truth). */
const DOCUMENT = `<!doctype html>
<html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>tap-target extent</title>
<style>
  body { margin: 0; font: 16px/1.4 system-ui, sans-serif; background: #fff; color: #111; }
  main { padding: 24px; display: flex; flex-direction: column; gap: 8px; width: 320px; }
  .row { display: flex; align-items: center; gap: 8px; }
  @media (pointer: coarse) { .row { min-height: 44px; } }
  .value { position: relative; border: 0; background: none; padding: 0; font: inherit; color: inherit; line-height: 18px; }
  .value::after { content: ""; position: absolute; left: 50%; top: 50%; width: 28px; height: 28px; transform: translate(-50%, -50%); }
  @media (pointer: coarse) { .value::after { width: 44px; height: 44px; } }
  .bare { border: 0; background: none; padding: 0; font: inherit; color: inherit; line-height: 18px; }
  .ringed { position: relative; border: 0; background: #eee; padding: 0; width: 25px; height: 25px; }
  /* the hit-area utilities the glyph ramp carried before #1843 … */
  .ringed::after { content: ""; position: absolute; top: 50%; left: 50%; width: 28px; height: 28px; translate: -50% -50%; }
  @media (pointer: coarse) { .ringed::after { width: 44px; height: 44px; } }
  /* … and the UNLAYERED CTA ring claiming the same pseudo, which wins for the properties it declares. */
  .ringed::after { content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none; border: 1px solid transparent; border-radius: inherit;
    background: linear-gradient(transparent, transparent) padding-box, linear-gradient(180deg, #6cf, #024) border-box; }
</style></head>
<body><main>
  <div class="row"><span>HP</span><button type="button" class="value" data-slot="floored-value">32</button></div>
  <div class="row"><span>Status</span><button type="button" class="value" data-slot="floored-status">—</button></div>
  <div><button type="button" class="bare" data-slot="bare-value">18</button></div>
  <div><button type="button" class="ringed" data-slot="ringed-glyph" aria-label="Regenerate"></button></div>
</main></body></html>`;

/** The CT kit's ownership rule — THE ACTUAL ONE, composed from the functions the kit itself calls
 *  (`tests/support/iso/hit-extent-walk.ts`) — run inside the page the auditor is judging.
 *
 *  It used to be a hand-copied second spelling, "spelled here rather than imported because the kit's
 *  function takes a Playwright `Locator`". That reason died when the rule moved to its own isomorphic
 *  home, and the copy was a live hazard: this arm's whole claim is that the two readers AGREE, and a copy
 *  agrees with whatever it says, not with what the kit does. */
const CT_WALK_EVAL = `(() => {
  const walk = ${HIT_EXTENT_WALK_SOURCE};
  const out = [];
  for (const el of document.querySelectorAll("[data-slot]")) {
    out.push(el.dataset.slot + "=" + walk(el, "x") + "x" + walk(el, "y"));
  }
  return out.join(" ");
})()`;

/** THE DISCRIMINATING DOCUMENT (#2300, rework — the first one could not fail).
 *
 *  `DOCUMENT` above cannot exercise ancestor credit AT ALL, and three probes with two planted controls
 *  proved it (cb-v-hit-geometry, 2026-09-13): reverting the walker to the pre-#2300 existence-only
 *  predicate, deleting its `pointer-events` clause, and disabling the kit's credit each left the suite
 *  10/10 GREEN. On that DOM every hit pseudo SELF-REPORTS, so ownership clause 1 answers and clause 2 —
 *  the entire subject of #2300 — never runs; and `ringed-glyph` is capped by `hitForwards` against a 25px
 *  wrapper under both predicates, so it is a finding either way. A control that passes against the defect
 *  it was written to catch is a fence, not a proof.
 *
 *  Every stage here is built so that CLAUSE 2 IS THE ONLY THING THAT CAN ANSWER at the probed rungs:
 *   · the stage is 300x300, textless and EMPTY apart from its one control, so a probe that leaves the
 *     control lands on an ancestor that CONTAINS it — `hitForwards` passes and the credit rung is
 *     reachable (what the 25px wrapper denied);
 *   · the control sits at the stage's centre with ≥100px of clear space, so no rung falls off the frame
 *     and `probeFrameFits` never refuses;
 *   · nothing else is offered, so `sharedCompositeOwns` cannot be the thing that decided.
 *
 *  The four arms and what each one holds down:
 *   · `credit-capped` — a 30px hit pseudo on a 20px box. Beyond ±15 the pseudo is simply not there, so the
 *     ancestor answers and the EXISTENCE-only predicate credits it out to the 44px rung. The measured
 *     rect stops at 15. This is the arm that reds when the credit stops being geometry-scoped.
 *   · `credit-clipped` — a 60px hit pseudo CLIPPED to 30px by an ancestor's `overflow: hidden`: the shape
 *     ancestor credit EXISTS for. Inside the clip the pseudo self-reports; outside it the pseudo paints
 *     nothing and the stage answers, so the extent past the clip is credit or nothing. Reds when either
 *     home's clause 2 is disabled.
 *   · `credit-unreachable` — a 60px OUTWARD pseudo with `pointer-events: none`. Geometry alone credits it;
 *     only the pointer clause refuses. Reds when that clause is deleted.
 *   · `credit-selfreporting` — a 44px hittable pseudo, nothing clipping it: clause 1 answers everywhere.
 *     The counter-control that keeps the other three from reading as "this fixture reds at everything". */
const CREDIT_DOCUMENT = `<!doctype html>
<html lang="en" data-app-ready="settled"><head><meta charset="utf-8"><title>ancestor credit</title>
<style>
  body { margin: 0; background: #fff; }
  .stage { position: relative; width: 300px; height: 300px; }
  .ctl { position: relative; display: block; width: 20px; height: 20px; padding: 0; border: 0; background: #ddd; margin: 140px auto; }
  .p30::before  { content: ""; position: absolute; top: 50%; left: 50%; width: 30px; height: 30px; translate: -50% -50%; }
  .p60::before  { content: ""; position: absolute; top: 50%; left: 50%; width: 60px; height: 60px; translate: -50% -50%; }
  .p44::before  { content: ""; position: absolute; top: 50%; left: 50%; width: 44px; height: 44px; translate: -50% -50%; }
  .dead::before { pointer-events: none; }
  .clip { overflow: hidden; width: 30px; height: 30px; margin: 135px auto; }
  .clip .ctl { margin: 5px; }
</style></head>
<body><main>
  <div class="stage"><button type="button" class="ctl p30" data-slot="credit-capped" aria-label="Capped"></button></div>
  <div class="stage"><div class="clip"><button type="button" class="ctl p60" data-slot="credit-clipped" aria-label="Clipped"></button></div></div>
  <div class="stage"><button type="button" class="ctl p60 dead" data-slot="credit-unreachable" aria-label="Unreachable"></button></div>
  <div class="stage"><button type="button" class="ctl p44" data-slot="credit-selfreporting" aria-label="Self reporting"></button></div>
</main></body></html>`;

/** The WALKER's own `pseudoHitEnvelope`, evaluated from the product source string, beside the KIT's. The
 *  segment is a run of `var`/`function` declarations, so wrapping it in an IIFE and returning the one
 *  function is enough — and no sibling-segment identifier is touched, because the envelope arithmetic
 *  reaches none of them (`isVisible`/`isDevChrome`/`isVisuallyHidden`/`INTERACTIVE_SELECTOR` are only
 *  reached from `ownsPoint`'s other clauses). Importing the REAL string is the point: a drift in the
 *  walker's arithmetic reds here rather than being described as impossible in a comment.
 *
 *  THE COORDINATES CROSS THE WIRE RAW (Leg 3). This emitted `Math.round(n * 100) / 100`, which made the
 *  arm's claim of EXACT equality false by up to half a centipixel in each direction: a one-sided
 *  `+ 0.001` planted in either home's `pseudoHitRect` left the comparison GREEN (measured — see the
 *  report's Leg 3 note). `String(double)` round-trips a JS number exactly, so the raw value is what is
 *  printed and what is compared; rounding survives only in the failure MESSAGE, where a human reads it. */
const ENVELOPE_AGREEMENT_EVAL = `(() => {
  const walkerEnvelope = (() => {
${WALKER_HIT_EXTENT}
    return pseudoHitEnvelope;
  })();
  const kitEnvelope = ${PSEUDO_ENVELOPE_SOURCE};
  const say = (rect) => rect === null ? "null" : [rect.left, rect.top, rect.right, rect.bottom].join(",");
  const out = [];
  for (const el of document.querySelectorAll("[data-slot]")) {
    out.push(el.dataset.slot + " walker=" + say(walkerEnvelope(el)) + " kit=" + say(kitEnvelope(el)));
  }
  return out.join(" | ");
})()`;

interface TapTargetReport {
  readonly findings: readonly { readonly rule: string; readonly selector: string; readonly value?: string }[];
}

function tapTargetSelectors(report: TapTargetReport): readonly string[] {
  return report.findings.filter((finding) => finding.rule === "tap-target").map((finding) => finding.selector);
}

test("#1678 — a pseudo-carried coarse floor is NOT a tap-target finding, and a bare text-height control IS", async ({ runCli, scratch }) => {
  const file = join(scratch, "tap-extent.html");
  await writeFile(file, DOCUMENT);

  // `--mobile`, because the 44px floor is pointer-CONDITIONAL (D62): at fine the rule owes 24px and the
  // 28px pseudo satisfies it, so a desktop run cannot tell the two shapes apart at all.
  const run = await runCli("snap", ["--file", file, "--mobile", ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  const report = JSON.parse(await readFile(auditReport(run.stdout), "utf8")) as TapTargetReport;
  const flagged = tapTargetSelectors(report);

  // THE ROW'S CLAIM, REFUTED AND PINNED: the auditor publishes the PSEUDO's extent for a row-floored value.
  expect(flagged, "a value whose coarse floor rides an overflowing ::after must not be reported").not.toContain("[data-slot=floored-value]");
  expect(flagged).not.toContain("[data-slot=floored-status]");
  // THE OTHER DIRECTION, in the same invocation: a control with no floor still fires, so the arm above is
  // not satisfied by a rule that stopped reporting.
  expect(flagged, "a bare 18px control is a real sub-target and must still fire").toContain("[data-slot=bare-value]");
  // #2300, the negative control the class never had: a pseudo that cannot take a pointer carries no
  // target, however outward its rect is. Before ancestor credit was geometry-scoped this control was
  // credited with its wrapper's extent and reported nothing.
  expect(flagged, "the pre-#1843 CTA-ringed glyph offers a 25px box and an untappable ring — it must fire").toContain("[data-slot=ringed-glyph]");
  // …and the population is genuinely judged — a silent census would satisfy every assertion above.
  expect(run.stdout).toMatch(/tap-target candidates=4 judged=4 affected=2/u);
});

test("#1678 — the CT kit's walk reaches the SAME VERDICT on the same DOM, in the same run (numbers differ by design)", async ({ runCli, scratch }) => {
  // The agreement is MEASURED, not inferred from two runs on two harnesses: the kit's own three-clause
  // `owns` predicate runs inside the audited page (a read-only `--eval`, so it cannot disturb the walk).
  const file = join(scratch, "tap-extent-agree.html");
  await writeFile(file, DOCUMENT);

  const run = await runCli("snap", ["--file", file, "--mobile", "--eval", CT_WALK_EVAL, ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });

  // The kit returns ONE line (`<slot>=<w>x<h> …`) rather than an object: snap echoes the whole expression
  // in the EVAL header, and this expression is multi-line, so a "parse the block after the header" reader
  // would be parsing the echo.
  const walked = (slot: string): { readonly x: number; readonly y: number } => {
    // ANNOTATED: `RegExp.exec` returns `RegExpExecArray | null`, but biome's own inference drops the null
    // arm for a pattern built from a template — without the type it calls the optional chain below
    // unnecessary while tsc calls its absence an error (the same disagreement #1659 hit on an optional
    // `disposition`).
    const match: RegExpExecArray | null = new RegExp(`${slot}=(\\d+)x(\\d+)`, "u").exec(run.stdout);
    const x = Number(match?.[1] ?? Number.NaN);
    const y = Number(match?.[2] ?? Number.NaN);
    // A MISSING extent must fail LOUDLY, never read as 0: the walk's own output is the evidence, so a
    // slot that never printed means the eval did not run, which is not the same as a small target.
    expect(Number.isFinite(x) && Number.isFinite(y), `no ${slot} extent in:\n${run.stdout}`).toBe(true);
    return { x, y };
  };

  // THE AGREEMENT IS ON THE VERDICT, NOT ON THE NUMBER: the auditor publishes a BOUNDED ring
  // (`2 x radius`, radii [11,12,16,22], so 44 is its ceiling) while the kit's 1px walk reports the pixels
  // it actually walked. Until #2300 the kit's walk was UNBOUNDED as well — once a pseudo merely EXISTED,
  // any ancestor containing the control owned the point, so it ran to the ROW's own edges and measured
  // 103x76 here. Geometry-scoped credit stops it at the pseudo, which is why the number moved and the
  // verdict did not.
  const floored = walked("floored-value");
  expect(Math.min(floored.x, floored.y), `the CT walk must clear the coarse floor: ${JSON.stringify(floored)}`).toBeGreaterThanOrEqual(44);
  expect(Math.min(walked("floored-status").x, walked("floored-status").y)).toBeGreaterThanOrEqual(44);
  // …and it refuses to credit an ANCESTOR for a control with no pseudo (the #662/#665 rule both sides
  // share), which is exactly why the auditor reports that one.
  expect(Math.min(walked("bare-value").x, walked("bare-value").y), "a control with no floor must NOT reach 44").toBeLessThan(44);
  // #2300's negative control, in the same run and on the same DOM as the auditor's verdict above: an
  // untappable ring is not a hit area, so the walk must stay on the 25px box. This is the arm that read
  // 161x161 before the fix — the same number it read for the FIXED control, which is what made it useless.
  const ringed = walked("ringed-glyph");
  expect(Math.max(ringed.x, ringed.y), `an untappable CTA ring must not be credited: ${JSON.stringify(ringed)}`).toBeLessThan(44);
});

/** `<slot>=<w>x<h>` pairs out of the kit-walk eval, keyed by slot. Missing extents fail LOUDLY: the walk's
 *  own output is the evidence, so a slot that never printed means the eval did not run, which is not the
 *  same as a small target. */
function walkedExtents(stdout: string, slots: readonly string[]): Readonly<Record<string, string>> {
  const found: Record<string, string> = {};
  for (const slot of slots) {
    const match: RegExpExecArray | null = new RegExp(`${slot}=(\\d+x\\d+)`, "u").exec(stdout);
    expect(match?.[1], `no ${slot} extent in:\n${stdout}`).toBeTypeOf("string");
    found[slot] = String(match?.[1]);
  }
  return found;
}

const CREDIT_SLOTS = ["credit-capped", "credit-clipped", "credit-unreachable", "credit-selfreporting"] as const;

/** One home's envelope for one element, as the RAW numbers it printed — `null` for a refusal, otherwise
 *  four finite coordinates. Nothing is rounded on the way in: the whole point of the arm is that a
 *  sub-centipixel disagreement between the two homes is a real disagreement, and a rounded read is how a
 *  coordinate-space mistake passes for agreement. A malformed or non-finite field fails LOUDLY here rather
 *  than comparing equal to another malformed one — `NaN === NaN` is false but `"NaN" === "NaN"` is not. */
function envelopeFields(printed: string | undefined, label: string): readonly number[] | null {
  expect(printed, `${label}: no envelope printed`).toBeTypeOf("string");
  if (printed === "null") {
    return null;
  }
  const fields = String(printed)
    .split(",")
    .map((field) => Number(field));
  expect(fields.length, `${label}: an envelope is four coordinates, got ${String(printed)}`).toBe(4);
  for (const field of fields) {
    expect(Number.isFinite(field), `${label}: a non-finite coordinate in ${String(printed)}`).toBe(true);
  }
  return fields;
}

/** The human-readable form of an envelope — rounded, because a failure message is for a reader. This is
 *  the ONLY place rounding is allowed to touch these numbers. */
function describeEnvelope(rect: readonly number[] | null): string {
  return rect === null ? "null" : `[${rect.map((field) => Math.round(field * 100) / 100).join(", ")}]`;
}

test("#2300 — ancestor credit, on a DOM where credit is the only thing that can answer: the WALKER's verdicts", async ({ runCli, scratch }) => {
  const file = join(scratch, "credit-discriminating.html");
  await writeFile(file, CREDIT_DOCUMENT);

  const run = await runCli("snap", ["--file", file, "--mobile", ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  const report = JSON.parse(await readFile(auditReport(run.stdout), "utf8")) as TapTargetReport;
  const flagged = tapTargetSelectors(report);

  // THE TWO ARMS THAT RED WHEN THE CREDIT STOPS BEING A MEASUREMENT. Both are sub-floor controls that the
  // pre-#2300 predicate published at the 44px rung by crediting the stage they sit in.
  expect(flagged, "a 30px pseudo on a 20px box owns 30px — the ancestor beyond it is not the control's target").toContain("[data-slot=credit-capped]");
  expect(flagged, "an untappable 60px pseudo carries NO target, however outward its rect is").toContain("[data-slot=credit-unreachable]");
  // …and the two that must NOT fire, in the same run: the clipped pseudo is exactly what ancestor credit
  // exists for, and the self-reporting one never needs it.
  expect(flagged, "a hit pseudo clipped by an ancestor still carries its floor — this is the credit's minted purpose").not.toContain(
    "[data-slot=credit-clipped]",
  );
  expect(flagged, "a 44px hittable pseudo answers for itself at every rung").not.toContain("[data-slot=credit-selfreporting]");
  // The population is genuinely judged — a silent census would satisfy every assertion above.
  expect(run.stdout).toMatch(/tap-target candidates=4 judged=4 affected=2/u);
});

test("#2300 — the same DOM through the KIT's walk: the numbers, and the envelope the two homes must share", async ({ runCli, scratch }) => {
  const file = join(scratch, "credit-agreement.html");
  await writeFile(file, CREDIT_DOCUMENT);

  const run = await runCli("snap", ["--file", file, "--mobile", "--eval", CT_WALK_EVAL, "--eval", ENVELOPE_AGREEMENT_EVAL, ...AUDIT_ARGV], {
    timeoutMs: RELATIONAL_CLI_TIMEOUT_MS,
  });
  const extents = walkedExtents(run.stdout, CREDIT_SLOTS);

  // EXACT NUMBERS, because this fixture is integer geometry with no text in it. The walk counts OWNED
  // SAMPLE POINTS at 1px steps from the centre and the credited band is HALF-OPEN — a 2r target centred
  // at c occupies [c - r, c + r), so the left walk reaches c - r and the right walk stops at c + r - 1,
  // and the count is 2r rather than the symmetric 2r - 1 a reader expects. Measured, not predicted: the
  // first run of this arm answered 30 where this comment's author had written 29.
  //   · 30px pseudo → 30 · 60px pseudo behind a 30px clip, credited to its real rect → 60
  //   · no reachable pseudo at all → the 20px border box → 20 · 44px hittable pseudo → 44
  // Pinning the numbers rather than a floor is what makes the kit's half of clause 2 falsifiable: with
  // the kit's ancestor credit disabled, `credit-clipped` collapses to the clip and this reds.
  expect(extents["credit-capped"], "the kit stops at the pseudo, not at the stage").toBe("30x30");
  expect(extents["credit-clipped"], "credit carries the walk past the clip, to the pseudo's real rect").toBe("60x60");
  expect(extents["credit-unreachable"], "an untappable pseudo leaves only the border box").toBe("20x20");
  expect(extents["credit-selfreporting"], "clause 1 answers the whole way").toBe("44x44");

  // THE CROSS-HOME PIN, and the honest form of it. The two published EXTENTS cannot be compared directly
  // — a rung-quantised ring against a 1px walk, "the numbers differ by design" since #1678 — but the
  // #2300 RULE is the credit envelope, and that must be one answer. Both are computed here from the two
  // homes' REAL sources, on the same elements, in the same page.
  //
  // THE COMPARISON IS ON RAW COORDINATES (Leg 3). It used to be on values the page had already rounded to
  // two decimals, so "exact" was a claim the arm could not make: a one-sided sub-centipixel drift — the
  // shape a coordinate-space or unit mistake actually produces — passed. The values are now parsed
  // unrounded and compared FIELD BY FIELD, every field required finite, and rounding appears only in the
  // message a human reads on failure.
  for (const slot of CREDIT_SLOTS) {
    // The rect alphabet — digits, dot, comma, minus, and an exponent — or the literal `null`. A `[^ |]+`
    // tail once captured the closing quote of snap's JSON-encoded eval line and the next line's `URL` on
    // the LAST slot, which reads exactly like a disagreement.
    const rect = "(null|[-0-9.,eE+]+)";
    const line: RegExpExecArray | null = new RegExp(`${slot} walker=${rect} kit=${rect}`, "u").exec(run.stdout);
    expect(line?.[1], `no envelope pair for ${slot} in:\n${run.stdout}`).toBeTypeOf("string");
    const walkerRect = envelopeFields(line?.[1], `${slot} walker`);
    const kitRect = envelopeFields(line?.[2], `${slot} kit`);
    expect(
      walkerRect,
      `${slot}: the walker and the kit must compute the SAME credit envelope — walker ${describeEnvelope(walkerRect)} vs kit ${describeEnvelope(kitRect)} (raw: ${String(line?.[1])} vs ${String(line?.[2])})`,
    ).toEqual(kitRect);
  }
  // …and the pin is not vacuous: at least one of them is a real rect and one is a refusal, so a pair of
  // functions that both answered `null` everywhere could not satisfy this.
  expect(run.stdout).toMatch(/credit-capped walker=\d/u);
  expect(run.stdout).toMatch(/credit-unreachable walker=null kit=null/u);
});
