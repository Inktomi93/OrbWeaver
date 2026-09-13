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
import { HIT_EXTENT_WALK_SOURCE } from "../../../../support/iso/hit-extent-walk.ts";
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
