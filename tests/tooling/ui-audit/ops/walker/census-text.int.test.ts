// The WCAG 1.4.3 inactive-control exemption, proven through the WHOLE instrument (ops/walker/census-text.ts's
// `INACTIVE_KIND_EXPR` interpolation + lib/checks-color.ts's exempt arm) rather than through the classifier
// string alone — a string assertion cannot see the defect this file exists to pin.
//
// THE DEFECT (#1005, measured 2026-09-01 by tests/ui/variant-arm-matrix): the shared classifier was
// ELEMENT-SCOPED (`el.matches(":disabled")`), so the text-bearing element inside a disabled control — a
// `<span>` label inside a disabled `<button>`, the placeholder span inside a disabled Select — matched none
// of its arms, classified "none", and was judged against the 4.5:1 AA floor the exemption absorbs. Every
// disabled control whose label lives in a child element was a standing false P1, which is exactly the class
// of instrument lie that teaches a reader to discount the tool's P1s wholesale.
//
// The fixture ratio is deliberately between the two floors (3.45:1): above WCAG 1.4.11's 3:1 UI-component
// boundary, so `inactive-control-legibility` stays silent, and below AA's 4.5:1, so the pre-fix classifier
// filed `contrast` P1. That separation is what makes this a two-sided proof instead of a swap of one
// finding for another.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RelationalPopulationReport } from "@orb/testkit/node";
import { AUDIT_ARGV, configureRelationalCliBudget, findingSelectors, RELATIONAL_CLI_TIMEOUT_MS, readAuditReport, relationalDocument } from "@orb/testkit/node";
import type { ToolFixtures } from "@orb/testkit/tooling";
import { auditRuleTest, expect, test } from "@orb/testkit/tooling";
import { FONT_PREVIEW_ATTRIBUTE } from "@orb/ui/select/items";

configureRelationalCliBudget();

async function auditFixture(scratch: string, runCli: ToolFixtures["runCli"], name: string, body: string): Promise<RelationalPopulationReport> {
  await writeFile(join(scratch, `${name}.html`), relationalDocument(body));
  const res = await runCli("snap", ["--file", join(scratch, `${name}.html`), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  return await readAuditReport(res.stdout);
}

/** #8a8a8a on #ffffff = 3.45:1 — under AA's 4.5:1, over 1.4.11's 3:1. */
const DIM_LABEL = "color:#8a8a8a;font-size:16px";
/** The same pair for a label that sits OUTSIDE the control: it needs its own white plate, because the
 *  fixture document's body is BLACK and #8a8a8a on black is 6.08:1 — a passing ratio, which would make
 *  every "must still fire" arm below pass for the wrong reason (measured: all three did, first run). */
const DIM_LABEL_PLATE = `${DIM_LABEL};background:#ffffff;width:140px`;
const CONTROL_BOX = "background:#ffffff;border:0;padding:8px;width:140px;height:40px";

// ── silent: the label INSIDE a disabled control is exempt, not a P1 ───────────

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "silent",
      reason:
        "the text-bearing element is a CHILD of the disabled control (the real markup shape: a <span> label inside a disabled <button>), which WCAG 1.4.3 exempts — the classifier must reach the ancestor, not only the element it is bound to",
      disposition: { kind: "excluded", reason: "inactiveExempt" },
    },
  ],
  "a label inside a disabled control is excluded as inactive, never filed as a contrast P1",
  async ({ runCli, scratch }) => {
    const body = `<button disabled style="${CONTROL_BOX}"><span style="${DIM_LABEL}">Pick one</span></button>`;
    const report = await auditFixture(scratch, runCli, "inactive-descendant", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(0);
    expect(report.populationAccounting?.["contrast"]?.excluded).toMatchObject({ inactiveExempt: 1 });
    // The advisory is the arm that MUST NOT fire in its place: 3.45:1 is above the UI-component floor.
    expect(report.findings.filter(({ rule }) => rule === "inactive-control-legibility")).toHaveLength(0);
    return report;
  },
);

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "silent",
      reason: "the aria-disabled spelling of the same shape — a declared-inactive control whose label is a descendant element",
      disposition: { kind: "excluded", reason: "inactiveExempt" },
    },
  ],
  "a label inside an aria-disabled control is excluded as inactive",
  async ({ runCli, scratch }) => {
    const body = `<div role="button" aria-disabled="true" style="${CONTROL_BOX}"><span style="${DIM_LABEL}">Pick one</span></div>`;
    const report = await auditFixture(scratch, runCli, "inactive-aria-descendant", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(0);
    expect(report.populationAccounting?.["contrast"]?.excluded).toMatchObject({ inactiveExempt: 1 });
    return report;
  },
);

// ── fires: the SAME markup with the control enabled is still judged ───────────
// The precision neighbour. Without it the fix above is indistinguishable from a classifier that calls
// everything inactive, which would silently exempt the whole app.

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "fires",
      reason:
        "the identical label/backdrop pair inside an ENABLED control is an ordinary AA failure — the ancestor-aware classifier must not exempt active controls",
    },
  ],
  "the same label inside an enabled control is still judged and fails AA",
  async ({ runCli, scratch }) => {
    const body = `<button style="${CONTROL_BOX}"><span style="${DIM_LABEL}">Pick one</span></button>`;
    const report = await auditFixture(scratch, runCli, "active-descendant", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(1);
    expect(report.populationAccounting?.["contrast"]).toMatchObject({ judged: 1, emitted: 1 });
  },
);

// ── THE NAMING RELATION (#1016) ──────────────────────────────────────────────
// WCAG 1.4.3 exempts "text that is part of an inactive user interface component", and a control's own
// accessible NAME is part of it even when the DOM puts the name outside the control's subtree — the
// normal shape for a slider (Base UI's Slider.Label is a plain <div> the thumb points at) and for any
// `<label for>`. Measured 2026-09-01: a disabled Slider's label read 3.19:1 under light (the house
// `data-disabled:opacity-50` group dim) and was filed an AA P1 — the instrument being wrong about the
// spec. Ruled ARM B 2026-09-01: fix the classifier, not the app's disabled affordance.
//
// The exemption is DELIBERATELY NARROW and every boundary below is a precision neighbour that must
// STILL FIRE, because a false clean is the expensive direction for a rule that claims "this fails".

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "silent",
      reason: "aria-labelledby: the disabled control's own name is part of the inactive component, wherever the DOM puts it (the live Slider shape)",
      disposition: { kind: "excluded", reason: "inactiveExempt" },
    },
  ],
  "text a DISABLED control names via aria-labelledby is exempt",
  async ({ runCli, scratch }) => {
    const body = `<div id="nm-1" style="${DIM_LABEL_PLATE}">Volume</div><div role="slider" aria-labelledby="nm-1" aria-disabled="true" style="${CONTROL_BOX}"></div>`;
    const report = await auditFixture(scratch, runCli, "named-by-disabled", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(0);
    expect(report.populationAccounting?.["contrast"]?.excluded).toMatchObject({ inactiveExempt: 1 });
    return report;
  },
);

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "silent",
      reason: "the token-list spelling: aria-labelledby names SEVERAL ids, so the reverse lookup must match a token, not the whole attribute",
      disposition: { kind: "excluded", reason: "inactiveExempt" },
    },
  ],
  "the reverse lookup matches a TOKEN of a multi-id aria-labelledby",
  async ({ runCli, scratch }) => {
    const body = `<div id="nm-a" style="${DIM_LABEL_PLATE}">Volume</div><div role="slider" aria-labelledby="nm-z nm-a" aria-disabled="true" style="${CONTROL_BOX}"></div>`;
    const report = await auditFixture(scratch, runCli, "named-token-list", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(0);
    // Silent BECAUSE exempt, not silent because unjudged — the distinction the first run of these
    // fixtures got wrong (a black-backdrop label passed the ratio outright).
    expect(report.populationAccounting?.["contrast"]?.excluded).toMatchObject({ inactiveExempt: 1 });
    return report;
  },
);

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "fires",
      reason: "PRECISION NEIGHBOUR 1 — the same label text named by an ENABLED control is ordinary judged text",
    },
  ],
  "text named by an ENABLED control is still judged",
  async ({ runCli, scratch }) => {
    const body = `<div id="nm-2" style="${DIM_LABEL_PLATE}">Volume</div><div role="slider" aria-labelledby="nm-2" style="${CONTROL_BOX}"></div>`;
    const report = await auditFixture(scratch, runCli, "named-by-enabled", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(1);
  },
);

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "fires",
      reason: "PRECISION NEIGHBOUR 2 — text merely ADJACENT to a disabled control names nothing; proximity is not an association",
    },
  ],
  "text adjacent to a disabled control, with no association, is still judged",
  async ({ runCli, scratch }) => {
    const body = `<div style="${DIM_LABEL_PLATE}">Volume</div><div role="slider" aria-disabled="true" style="${CONTROL_BOX}"></div>`;
    const report = await auditFixture(scratch, runCli, "adjacent-not-named", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(1);
  },
);

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "fires",
      reason: "PRECISION NEIGHBOUR 3 — a labelledby pointing at an id nothing carries is a broken reference, not an exemption",
    },
  ],
  "a disabled control whose aria-labelledby names a MISSING id exempts nothing",
  async ({ runCli, scratch }) => {
    const body = `<div id="nm-3" style="${DIM_LABEL_PLATE}">Volume</div><div role="slider" aria-labelledby="nm-absent" aria-disabled="true" style="${CONTROL_BOX}"></div>`;
    const report = await auditFixture(scratch, runCli, "named-missing-id", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(1);
  },
);

auditRuleTest(
  [
    {
      rule: "inactive-control-legibility",
      kind: "fires",
      reason:
        "the exemption is from the AA MINIMUM only: an exempted NAME rides the 1.4.11 3:1 advisory floor exactly like the control itself, so a name dimmed to invisibility still surfaces",
    },
  ],
  "an exempted name dimmed below the UI-component floor still fires the P3 advisory",
  async ({ runCli, scratch }) => {
    const body = `<div id="nm-4" style="color:#000000;font-size:16px;opacity:0.3;background:#ffffff;width:140px">Volume</div><div role="slider" aria-labelledby="nm-4" aria-disabled="true" style="${CONTROL_BOX}"></div>`;
    const report = await auditFixture(scratch, runCli, "named-below-floor", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(0);
    const advisories = report.findings.filter(({ rule }) => rule === "inactive-control-legibility");
    expect(advisories).toHaveLength(1);
  },
);

// ── the VENDOR spelling of the same state ────────────────────────────────────
// A Base UI COMPOSITE root is a <div>: it cannot match `:disabled`, and the app is built almost entirely
// out of those composites (Slider/Select/Toggle/Switch). The pseudo-only arm was therefore blind to every
// disabled composite in the product — measured through this very suite family: a disabled Slider's label
// stayed a P1 after the naming relation landed, because nothing in the chain matched `:disabled`.

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "silent",
      reason:
        "Base UI stamps [data-disabled] on a composite ROOT (a div, which cannot carry :disabled) — RULE-AUTHORING row 3's class, and state-paint.ts's vocabulary already declares data-disabled 'WCAG 1.4.3 inactive-exempt'",
      disposition: { kind: "excluded", reason: "inactiveExempt" },
    },
  ],
  "text inside a [data-disabled] composite root is exempt",
  async ({ runCli, scratch }) => {
    const body = `<div data-disabled style="${CONTROL_BOX}"><span style="${DIM_LABEL}">Volume</span></div>`;
    const report = await auditFixture(scratch, runCli, "vendor-disabled", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(0);
    expect(report.populationAccounting?.["contrast"]?.excluded).toMatchObject({ inactiveExempt: 1 });
    return report;
  },
);

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "fires",
      reason:
        "PRECISION NEIGHBOUR 4 — data-trigger-disabled is a DIFFERENT Base UI attribute (a popup-metadata flag, not the control's own inactive state) and must not exempt anything",
    },
  ],
  "the neighbouring data-trigger-disabled attribute exempts nothing",
  async ({ runCli, scratch }) => {
    const body = `<div data-trigger-disabled style="${CONTROL_BOX}"><span style="${DIM_LABEL}">Volume</span></div>`;
    const report = await auditFixture(scratch, runCli, "vendor-neighbour", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(1);
  },
);

// ── #1078 (orb-ui audit F6): mask paint is INVISIBLE to getComputedStyle, so a masked ancestor withholds ──
//
// The scroll-fade recipes in packages/ui/src/styles/globals.css put `mask-image` on the SCROLLING CONTAINER, not
// on the text — CSS masking composites the whole subtree, so a descendant text node's PAINTED alpha fades
// toward transparent while its own `color`/`opacity` still report full strength. `hasMaskedAncestor`
// (census-text.ts) walks the ancestor chain for a live `mask-image`/`-webkit-mask-image`, mirroring the
// authoring shape rather than any one component.
const MASK = "mask-image:linear-gradient(to right, black, transparent);-webkit-mask-image:linear-gradient(to right, black, transparent)";

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "silent",
      reason:
        "a text node under a masked ancestor is excluded even at a failing ratio — resolving it flat would fabricate a ratio the mask never actually paints",
      disposition: { kind: "excluded", reason: "maskedForeground" },
    },
  ],
  "text under a masked ancestor is excluded, not resolved flat",
  async ({ runCli, scratch }) => {
    const body = `<div style="${CONTROL_BOX};${MASK}"><span style="${DIM_LABEL}">Volume</span></div>`;
    const report = await auditFixture(scratch, runCli, "masked-ancestor", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(0);
    expect(report.populationAccounting?.["contrast"]?.excluded).toMatchObject({ maskedForeground: 1 });
    return report;
  },
);

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "fires",
      reason: "an UNMASKED sibling at the identical failing ratio is the control proving the walker does not blanket-withhold every text sample",
    },
  ],
  "an unmasked sibling at the identical ratio still fires",
  async ({ runCli, scratch }) => {
    const body = `<div style="${CONTROL_BOX};${MASK}"><span style="${DIM_LABEL}">Volume</span></div><div style="${CONTROL_BOX}"><span style="${DIM_LABEL}">Balance</span></div>`;
    const report = await auditFixture(scratch, runCli, "masked-and-unmasked", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(1);
    expect(report.populationAccounting?.["contrast"]).toMatchObject({ candidates: 2, judged: 1, excluded: { maskedForeground: 1 } });
  },
);

// ── `distorted-image`'s background-image sizing mode (#1825) ────────────────────────────────
//
// A 2:1 raster (100x50) painted as a `background-image` on a 1:1 box (100x100). Under the DEFAULT
// `background-size: auto` the image paints at its own natural size — exactly like `object-fit: none` —
// and cannot squish no matter how the box is shaped, so `distorted-image` must stay silent. Under an
// EXPLICIT `background-size: 100% 100%` the same raster is stretched to fill the box on both axes
// independently, a real 100% aspect deviation, so the rule must fire. Both fixtures share the identical
// raster and box; only the `background-size` declaration differs.
// %22-encoded SVG attribute quotes, doubly load-bearing: this URL sits inside a CSS `url(' … ')` (single
// quotes), which itself sits inside an HTML `style="…"` attribute (double quotes). A single-quoted SVG
// attribute breaks the CSS string (a single-quoted CSS string terminates at its first embedded `'`); a
// LITERAL double-quoted one breaks the HTML attribute instead (it terminates at its first embedded `"`).
// Percent-encoding is the one spelling neither host's quoting can see through.
const BG_RASTER_URL =
  "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%2250%22%3E%3Crect width=%22100%22 height=%2250%22 fill=%22black%22/%3E%3C/svg%3E";
const BG_BOX = `width:100px;height:100px;background-image:url('${BG_RASTER_URL}');background-repeat:no-repeat`;

auditRuleTest(
  [
    {
      rule: "distorted-image",
      kind: "silent",
      reason:
        "background-size: auto (the CSS default) paints the raster at its own natural size, exactly like object-fit: none — it cannot squish, so it must not be judged for aspect deviation against the box",
      disposition: { kind: "excluded", reason: "objectFitDoesNotScale" },
    },
  ],
  "a background-image under the default background-size: auto is excluded, never judged",
  async ({ runCli, scratch }) => {
    const body = `<div style="${BG_BOX};background-size:auto"></div>`;
    const report = await auditFixture(scratch, runCli, "bg-distortion-auto", body);
    expect(report.findings.filter(({ rule }) => rule === "distorted-image")).toHaveLength(0);
    expect(report.populationAccounting?.["distorted-image"]?.excluded).toMatchObject({ objectFitDoesNotScale: 1 });
    return report;
  },
);

auditRuleTest(
  [
    {
      rule: "distorted-image",
      kind: "fires",
      reason:
        "the identical raster under an EXPLICIT background-size: 100% 100% is stretched to the box on both axes independently — a real distortion the rule must still catch",
    },
  ],
  "the same background-image under an explicit stretching background-size still fires",
  async ({ runCli, scratch }) => {
    const body = `<div style="${BG_BOX};background-size:100% 100%"></div>`;
    const report = await auditFixture(scratch, runCli, "bg-distortion-scales", body);
    expect(report.findings.filter(({ rule }) => rule === "distorted-image")).toHaveLength(1);
    expect(report.populationAccounting?.["distorted-image"]).toMatchObject({ judged: 1, emitted: 1 });
  },
);

// ── a translucent plate over a replaced-element art layer ─────────────────────
// The paint-layer census sees an art layer painted by CSS; a fixed <img> paints no CSS background, so a
// plate over it composited against the opaque body and read as a passing flat backdrop.

const ART_RASTER_URL =
  "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22%3E%3Crect width=%2210%22 height=%2210%22 fill=%22white%22/%3E%3C/svg%3E";
const FIXED_ART = `<img alt="" src="${ART_RASTER_URL}" style="position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none">`;
const GLASS_PLATE = '<div style="margin:20px;width:300px;padding:10px;background:rgba(0,0,0,0.3);color:#ffffff;font-size:14px"><span>Small ink</span></div>';

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "fires",
      reason:
        "white ink over a 30% black plate over a white fixed image reads about 2.4:1 on screen; the CSS composite against the black body reads as passing",
    },
  ],
  "small ink on a translucent plate over a fixed image is measured from pixels and fails",
  async ({ runCli, scratch }) => {
    const report = await auditFixture(scratch, runCli, "plate-over-img-art", `${FIXED_ART}${GLASS_PLATE}`);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(1);
    expect(report.populationAccounting?.["contrast"]).toMatchObject({ judged: 1, affected: 1 });
  },
);

// The art under a caption plate is usually an ordinary in-flow child of the card, not a positioned layer.
const CAPTION_PLATE =
  '<div style="position:absolute;left:0;bottom:0;width:300px;padding:10px;background:rgba(0,0,0,0.3);color:#ffffff;font-size:14px"><span>Small ink</span></div>';
const CARD_BOX = "position:relative;width:320px;height:200px";
const WHITE_ART_BOX = "display:block;width:320px;height:200px";
const PLATE_OVER_ART_SHAPES = [
  ["an in-flow img", `<img alt="" src="${ART_RASTER_URL}" style="${WHITE_ART_BOX}">`],
  ["an in-flow canvas", `<canvas width="320" height="200" style="${WHITE_ART_BOX};background:#ffffff"></canvas>`],
  ["an inline svg", `<svg width="320" height="200" style="display:block"><rect width="320" height="200" fill="#ffffff"></rect></svg>`],
  ["an in-flow background image", `<div style="${WHITE_ART_BOX};background-image:url('${ART_RASTER_URL}');background-size:cover"></div>`],
  [
    "art inside a host that also holds text",
    `<div style="position:absolute;inset:0"><img alt="" src="${ART_RASTER_URL}" style="${WHITE_ART_BOX}"><i style="position:absolute;top:0;color:#000;background:#fff">tag</i></div>`,
  ],
] as const;

test.for(PLATE_OVER_ART_SHAPES)("small ink on a translucent plate over %s is measured from pixels and fails", async ([name, art], { runCli, scratch }) => {
  const report = await auditFixture(scratch, runCli, `plate-over-${name.replaceAll(" ", "-")}`, `<div style="${CARD_BOX}">${art}${CAPTION_PLATE}</div>`);
  expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(1);
  expect(report.populationAccounting?.["contrast"]).toMatchObject({ affected: 1 });
});

const CAPTIONED_CARD = `<div style="${CARD_BOX}"><img alt="" src="${ART_RASTER_URL}" style="${WHITE_ART_BOX}">${CAPTION_PLATE}</div>`;

auditRuleTest(
  [
    { rule: "contrast", kind: "fires", reason: "the caption below the fold is scrolled to and measured like its in-view twin, so both fail" },
    {
      rule: "text-over-art",
      kind: "silent",
      reason: "a caption the audit can scroll to is measured, never filed as art it could not see",
      disposition: { kind: "excluded", reason: "flatBackdrop" },
    },
  ],
  "a caption over in-flow art below the fold is measured, not filed as unseen art",
  async ({ runCli, scratch }) => {
    const report = await auditFixture(scratch, runCli, "caption-below-fold", `${CAPTIONED_CARD}<div style="height:2400px"></div>${CAPTIONED_CARD}`);
    expect(report.populationAccounting?.["contrast"]).toMatchObject({ judged: 2, affected: 2 });
    expect(report.populationAccounting?.["text-over-art"]?.excluded).toEqual({ flatBackdrop: 2 });
    return report;
  },
);

// Each depth is more than half a viewport from the last, so every caption needs a scroll position of its own. The
// hover label sits above them all: the hover pass runs after the reveal and must find the page where the walk left it.
const DEEP_CAPTIONS = [0, 1, 2, 3].map(() => `${CAPTIONED_CARD}<div style="height:1400px"></div>`).join("");
const HOVER_LABEL =
  '<style>.hover-label { display: inline-block; color: #8a8a8a; } .hover-label:hover { color: #ffffff; }</style><span class="hover-label">hover label</span>';

auditRuleTest(
  [
    { rule: "contrast", kind: "fires", reason: "a caption at every depth is measured from a shot of its own, and each fails" },
    {
      rule: "hover-contrast",
      kind: "silent",
      reason: "the hover pass after the reveal judges the label above the captions, so the scroll came back",
      disposition: { kind: "judged" },
    },
    {
      rule: "hover-contrast",
      kind: "silent",
      reason: "the four captions paint nothing on hover, so they leave the hover population by name",
      disposition: { kind: "excluded", reason: "noHoverPaint" },
    },
  ],
  "captions at four depths are each measured, and the hover pass after them still judges the top of the page",
  async ({ runCli, scratch }) => {
    const report = await auditFixture(scratch, runCli, "caption-depths", `${HOVER_LABEL}${DEEP_CAPTIONS}`);
    // Five texts: the four captions, which fail, and the hover label, which passes at rest.
    expect(report.populationAccounting?.["contrast"]).toMatchObject({ judged: 5, affected: 4, withheld: {} });
    expect(report.populationAccounting?.["text-over-art"]?.excluded).toEqual({ flatBackdrop: 5 });
    return report;
  },
);

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "silent",
      reason: "a caption parked past a carousel's edge stays off-screen after the page scroll, so it has no verdict",
      disposition: { kind: "withheld", reason: "unresolvedBackdrop" },
    },
    {
      rule: "text-over-art",
      kind: "silent",
      reason: "a caption the audit could not reach is withheld, never filed as unseen art",
      disposition: { kind: "withheld", reason: "unresolvedBackdrop" },
    },
  ],
  "a caption over in-flow art that no page scroll reaches is withheld",
  async ({ runCli, scratch }) => {
    const report = await auditFixture(
      scratch,
      runCli,
      "caption-past-carousel",
      `<div style="display:flex;width:340px;overflow-x:auto"><div style="flex:none;width:2400px"></div>${CAPTIONED_CARD}</div>`,
    );
    expect(report.populationAccounting?.["contrast"]).toMatchObject({ candidates: 1, judged: 0 });
    return report;
  },
);

// A picture beside a label, and an icon inside one, sit next to the glyphs: neither backs them.
const ART_BESIDE_INK_SHAPES = [
  [
    "a picture beside the plate",
    `<div style="display:flex;gap:12px;width:640px"><img alt="" src="${ART_RASTER_URL}" style="width:200px;height:200px"><div style="width:300px;padding:10px;background:rgba(0,0,0,0.3);color:#ffffff;font-size:14px"><span>Small ink</span></div></div>`,
  ],
  [
    "an icon inside the labelled box",
    `<div style="width:300px;padding:10px;background:rgba(0,0,0,0.3);color:#ffffff;font-size:14px"><img alt="" src="${ART_RASTER_URL}" style="width:280px;height:60px;display:block">Small ink</div>`,
  ],
] as const;

test.for(ART_BESIDE_INK_SHAPES)("%s stays a flat backdrop", async ([name, body], { runCli, scratch }) => {
  const report = await auditFixture(scratch, runCli, `ink-beside-${name.replaceAll(" ", "-")}`, body);
  expect(report.findings.filter(({ rule }) => rule === "contrast")).toEqual([]);
  expect(report.populationAccounting?.["contrast"]).toMatchObject({ judged: 1, affected: 0 });
  expect(report.populationAccounting?.["text-over-art"]?.excluded).toMatchObject({ flatBackdrop: 1 });
  expect(report.populationAccounting?.["gray-on-color"]).toMatchObject({ excluded: expect.not.objectContaining({ pixelSampled: expect.anything() }) });
});

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "silent",
      reason: "the same plate with no art behind it is a true flat backdrop: 30% black over the black body passes, and text-over-art stays excluded",
      disposition: { kind: "judged" },
    },
  ],
  "the same plate over no art stays a flat backdrop",
  async ({ runCli, scratch }) => {
    const report = await auditFixture(scratch, runCli, "plate-over-flat", GLASS_PLATE);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(0);
    expect(report.populationAccounting?.["contrast"]).toMatchObject({ judged: 1, affected: 0 });
    expect(report.populationAccounting?.["text-over-art"]?.excluded).toMatchObject({ flatBackdrop: 1 });
    return report;
  },
);

// ── a translucent gradient over its own opaque fill ───────────────────────────
// The menu popup's scroll shadow: two translucent bands at the box edges over an opaque fill on the same element.
// CSS paints that fill under the image, so the base is known; which band sits under the glyphs is a pixel question.

const SHADOW_BANDS = "background-image:linear-gradient(rgba(255,255,255,0.4), transparent);background-size:100% 4px;background-repeat:no-repeat";
const SHADOWED_ROW = (base: string, ink: string): string =>
  `<div style="width:320px;padding:24px 10px;background-color:${base};${SHADOW_BANDS};color:${ink};font-size:14px"><span>Menu row</span></div>`;
const PAST_CAROUSEL_EDGE = (body: string): string =>
  `<div style="display:flex;width:340px;overflow-x:auto"><div style="flex:none;width:2400px"></div>${body}</div>`;

auditRuleTest(
  [
    {
      rule: "text-over-art",
      kind: "silent",
      reason: "the shadow bands sit over the row's own opaque fill, so the pixels measure a flat backdrop and no art is under the ink",
      disposition: { kind: "excluded", reason: "flatBackdrop" },
    },
    { rule: "contrast", kind: "silent", reason: "white ink on the measured black fill passes", disposition: { kind: "judged" } },
  ],
  "a translucent gradient over its own opaque fill is measured from pixels, not filed as art",
  async ({ runCli, scratch }) => {
    const report = await auditFixture(scratch, runCli, "gradient-over-fill", SHADOWED_ROW("#000000", "#ffffff"));
    expect(report.findings.filter(({ rule }) => rule === "text-over-art")).toEqual([]);
    expect(report.populationAccounting?.["gray-on-color"]?.excluded).toMatchObject({ pixelSampled: 1 });
    return report;
  },
);

auditRuleTest(
  [
    { rule: "contrast", kind: "fires", reason: "dark ink on the same row's dark fill reads about 1.7:1 in the pixels and still fails" },
    {
      rule: "text-over-art",
      kind: "silent",
      reason: "the failure is a contrast verdict on measured pixels, not an art refusal",
      disposition: { kind: "excluded", reason: "flatBackdrop" },
    },
  ],
  "dark ink over a translucent gradient on a dark fill still fails contrast through the pixel pass",
  async ({ runCli, scratch }) => {
    const report = await auditFixture(scratch, runCli, "gradient-over-fill-dark", SHADOWED_ROW("#000000", "#333333"));
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(1);
    expect(report.populationAccounting?.["contrast"]).toMatchObject({ judged: 1, affected: 1 });
    return report;
  },
);

const UNREACHED_GRADIENT_PROOFS = [
  {
    rule: "text-over-art",
    kind: "silent",
    reason: "a row the pixels cannot see has no verdict; it is withheld, never filed as art or passed",
    disposition: { kind: "withheld", reason: "unresolvedBackdrop" },
  },
  {
    rule: "contrast",
    kind: "silent",
    reason: "the same row has no contrast verdict either",
    disposition: { kind: "withheld", reason: "unresolvedBackdrop" },
  },
] as const;

auditRuleTest(UNREACHED_GRADIENT_PROOFS, "a translucent gradient row past a carousel edge is withheld", async ({ runCli, scratch }) => {
  const report = await auditFixture(scratch, runCli, "gradient-over-fill-unreached", PAST_CAROUSEL_EDGE(SHADOWED_ROW("#000000", "#ffffff")));
  expect(report.findings.filter(({ rule }) => rule === "text-over-art")).toEqual([]);
  return report;
});

auditRuleTest(UNREACHED_GRADIENT_PROOFS, "a translucent gradient with no opaque base past a carousel edge is withheld", async ({ runCli, scratch }) => {
  const noBase = "<style>html, body { background: transparent !important; }</style>";
  const report = await auditFixture(scratch, runCli, "gradient-no-base-unreached", `${noBase}${PAST_CAROUSEL_EDGE(SHADOWED_ROW("transparent", "#ffffff"))}`);
  expect(report.findings.filter(({ rule }) => rule === "text-over-art")).toEqual([]);
  return report;
});

// ── a paint layer the text is not over ────────────────────────────────────────
// Each subject below is covered by a contentless, unpainted box, so the pixel pass cannot sample it. That is the
// case where a layer the walk names is reclassified as unseen art, so the layer must really be under the glyphs.

const WHITE_FILL = "background-image:linear-gradient(#ffffff, #ffffff)";
const COVERED_INK = '<span style="position:relative;color:#ffffff;font-size:14px">Look</span><div style="position:absolute;inset:0"></div>';
const INK_BOX = "position:relative;width:320px;height:40px;margin:20px";

auditRuleTest(
  [
    {
      rule: "text-over-art",
      kind: "silent",
      reason: "the overflow fade comes later in the tree with both z-index auto, so it paints over the caption, not between it and the body",
      disposition: { kind: "excluded", reason: "flatBackdrop" },
    },
  ],
  "a gradient cover painted over a caption is not art under it",
  async ({ runCli, scratch }) => {
    const fade = '<div style="position:absolute;inset:0;background-image:linear-gradient(to left, #000000, transparent)"></div>';
    const report = await auditFixture(
      scratch,
      runCli,
      "fade-over-caption",
      `<div style="${INK_BOX}"><span style="color:#ffffff;font-size:14px">Look</span>${fade}</div>`,
    );
    expect(report.findings.filter(({ rule }) => rule === "text-over-art")).toEqual([]);
    return report;
  },
);

// Later in the tree but under the text in paint order: the layer stays between, so the pixels measure white on white.
const LATER_LAYER_UNDER_INK = [
  [
    "a negative z-index",
    `<div style="${INK_BOX}"><span style="color:#ffffff;font-size:14px">Look</span><div style="position:absolute;inset:0;z-index:-1;${WHITE_FILL}"></div></div>`,
  ],
  [
    "a sibling stacking context ranked below the text's",
    `<div style="position:relative;z-index:1;width:320px;height:40px;margin:0 20px"><span style="color:#ffffff;font-size:14px">Look</span></div><div style="position:relative;z-index:0;width:320px;height:40px;margin:-40px 20px 0"><div style="position:absolute;inset:0;${WHITE_FILL}"></div></div>`,
  ],
] as const;

test.for(LATER_LAYER_UNDER_INK)("a later layer under the ink by %s still backs it", async ([name, body], { runCli, scratch }) => {
  const report = await auditFixture(scratch, runCli, `later-layer-under-${name.replaceAll(" ", "-").replaceAll("'", "")}`, body);
  expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(1);
  expect(report.populationAccounting?.["gray-on-color"]?.excluded).toMatchObject({ pixelSampled: 1 });
});

// A virtualized grid row scrolled out of its scroller: its box reaches past the scroller's edge onto the ink below.
const ART_ROW = `position:absolute;top:200px;left:0;right:0;height:60px;background-image:url('${ART_RASTER_URL}');background-size:cover`;
const SCROLLED_GRID = (overflow: string): string =>
  `<div style="position:relative;width:320px;height:60px;overflow:${overflow}"><div style="position:relative;height:400px"><div style="${ART_ROW}"></div></div></div>`;
const INK_UNDER_GRID = `<div style="height:150px"></div><div style="${INK_BOX};margin:0">${COVERED_INK}</div>`;

auditRuleTest(
  [
    {
      rule: "text-over-art",
      kind: "silent",
      reason: "the art row is clipped by its scroller, so nothing it paints reaches the ink",
      disposition: { kind: "excluded", reason: "flatBackdrop" },
    },
  ],
  "an art row clipped by its scroller does not back the ink below the scroller",
  async ({ runCli, scratch }) => {
    const report = await auditFixture(scratch, runCli, "clipped-art-row", `${SCROLLED_GRID("auto")}${INK_UNDER_GRID}`);
    expect(report.findings.filter(({ rule }) => rule === "text-over-art")).toEqual([]);
    return report;
  },
);

auditRuleTest(
  [{ rule: "text-over-art", kind: "fires", reason: "the same art row with no clip paints under the ink, which the pixels cannot see, so it is art" }],
  "the same art row unclipped still files the covered ink as text over art",
  async ({ runCli, scratch }) => {
    const report = await auditFixture(scratch, runCli, "unclipped-art-row", `${SCROLLED_GRID("visible")}${INK_UNDER_GRID}`);
    expect(report.findings.filter(({ rule }) => rule === "text-over-art")).toHaveLength(1);
  },
);

// Covered ink straddling a scroller's edge, with an art row inside the scroller at a given offset from its top.
const INK_ACROSS_SCROLLER_EDGE = (rowTop: number): string =>
  `<div style="position:relative;width:320px;height:200px"><div style="width:320px;height:60px;overflow:auto"><div style="position:relative;height:400px"><div style="position:absolute;top:${String(rowTop)}px;left:0;right:0;height:20px;background-image:url('${ART_RASTER_URL}')"></div></div></div><div style="position:absolute;top:40px;left:0;width:320px;height:60px"><span style="position:relative;display:inline-block;line-height:60px;color:#ffffff;font-size:14px">Look</span><div style="position:absolute;inset:0"></div></div></div>`;

auditRuleTest(
  [
    {
      rule: "text-over-art",
      kind: "silent",
      reason: "the art row sits wholly below the scroller's 60px edge, so it paints nothing even where the ink straddles that edge",
      disposition: { kind: "excluded", reason: "flatBackdrop" },
    },
  ],
  "an art row clipped wholly out of its scroller does not back ink across the scroller's edge",
  async ({ runCli, scratch }) => {
    const report = await auditFixture(scratch, runCli, "art-row-clipped-out", INK_ACROSS_SCROLLER_EDGE(70));
    expect(report.findings.filter(({ rule }) => rule === "text-over-art")).toEqual([]);
    return report;
  },
);

auditRuleTest(
  [{ rule: "text-over-art", kind: "fires", reason: "the same row inside the scroller's visible box paints under the covered ink, so it is art" }],
  "an art row inside its scroller's visible box still backs the covered ink",
  async ({ runCli, scratch }) => {
    const report = await auditFixture(scratch, runCli, "art-row-in-view", INK_ACROSS_SCROLLER_EDGE(38));
    expect(report.findings.filter(({ rule }) => rule === "text-over-art")).toHaveLength(1);
  },
);

// A bordered control past a carousel edge over a fill-only layer: border-contrast keeps the label it always printed.
auditRuleTest(
  [
    {
      rule: "border-contrast",
      kind: "silent",
      reason: "the fill reason belongs to the text census; the border rule's withheld label stays paint-layer-over-base",
      disposition: { kind: "withheld", reason: "paint-layer-over-base" },
    },
  ],
  "a border over a fill-only layer keeps its withheld label",
  async ({ runCli, scratch }) => {
    const control = `<div style="position:relative;flex:none;width:200px;height:48px"><div style="position:absolute;inset:0;background:rgba(255,255,255,0.2)"></div><input aria-label="Name" style="position:relative;margin:8px;border:1px solid #888888;background:transparent;color:#ffffff"></div>`;
    const report = await auditFixture(scratch, runCli, "border-over-fill-unreached", PAST_CAROUSEL_EDGE(control));
    expect(report.populationAccounting?.["border-contrast"]).toMatchObject({ candidates: 1, judged: 0 });
    return report;
  },
);

// A tab caption scrolled past its strip's edge: its box reaches an art layer outside the strip, but it paints nothing.
const ART_BESIDE_STRIP = `position:absolute;top:0;left:240px;width:80px;height:40px;background-image:url('${ART_RASTER_URL}');background-size:cover`;
const CLIPPED_CAPTION = `<div style="${INK_BOX}"><div style="${ART_BESIDE_STRIP}"></div><div style="width:200px;overflow:hidden;white-space:nowrap"><span style="display:inline-block;width:260px"></span><span style="position:relative;color:#ffffff;font-size:14px">Trust</span></div></div>`;

auditRuleTest(
  [
    {
      rule: "text-over-art",
      kind: "silent",
      reason: "the caption is clipped out of its strip, so no part of it paints over the art beside the strip",
      disposition: { kind: "excluded", reason: "flatBackdrop" },
    },
  ],
  "a caption scrolled out of its strip does not meet an art layer outside the strip",
  async ({ runCli, scratch }) => {
    const report = await auditFixture(scratch, runCli, "clipped-caption-beside-art", CLIPPED_CAPTION);
    expect(report.findings.filter(({ rule }) => rule === "text-over-art")).toEqual([]);
    return report;
  },
);

auditRuleTest(
  [
    {
      rule: "text-over-art",
      kind: "silent",
      reason: "a colour fill under covered ink carries no art, so the unseen sample is withheld rather than filed as art",
      disposition: { kind: "withheld", reason: "unresolvedBackdrop" },
    },
  ],
  "a fill-only layer under covered ink is withheld, not reclassified as art",
  async ({ runCli, scratch }) => {
    const fill = '<div style="position:absolute;inset:0;background:rgba(255,255,255,0.2)"></div>';
    const report = await auditFixture(scratch, runCli, "fill-under-covered-ink", `<div style="${INK_BOX}">${fill}${COVERED_INK}</div>`);
    expect(report.findings.filter(({ rule }) => rule === "text-over-art")).toEqual([]);
    return report;
  },
);

// ── line-length: a run cut to one line has no line return ─────────────────────
// The Characters facet row's filled preview: a gloss-voiced span inside the row button, cut to one line and
// aria-hidden, echoing a long field body. The two controls keep the voice, the size and the box and change
// only whether the run may wrap.
const FACET_BODY = "She keeps the lighthouse at the end of the causeway and answers every knock with a question. ".repeat(6).trim();
const FACET_ROW_STYLE = "display:block;width:620px;font-size:13px;line-height:1.5;color:#ffffff";

auditRuleTest(
  [
    {
      rule: "line-length",
      kind: "silent",
      reason: "a run its computed style holds to one cut line paints one line box, so no line return exists to lose",
      disposition: { kind: "excluded", reason: "singleLineTruncation" },
    },
  ],
  "a facet preview truncated to one line is excluded from line-length",
  async ({ runCli, scratch }) => {
    const body = `<button type="button" style="display:block;background:#000;border:0;padding:4px"><span aria-hidden="true" data-voice="gloss" style="${FACET_ROW_STYLE};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${FACET_BODY}</span></button>`;
    const report = await auditFixture(scratch, runCli, "facet-preview-truncated", body);
    expect(report.populationAccounting?.["line-length"]).toMatchObject({ judged: 0, excluded: { singleLineTruncation: 1 } });
    return report;
  },
);

auditRuleTest(
  [
    {
      rule: "line-length",
      kind: "silent",
      reason: "a one-line clamp leaves one painted line box even though the hidden lines are laid out",
      disposition: { kind: "excluded", reason: "singleLineTruncation" },
    },
  ],
  "a run clamped to one line is excluded from line-length",
  async ({ runCli, scratch }) => {
    const body = `<p data-voice="gloss" style="${FACET_ROW_STYLE};overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1">${FACET_BODY}</p>`;
    const report = await auditFixture(scratch, runCli, "facet-preview-clamped", body);
    expect(report.populationAccounting?.["line-length"]).toMatchObject({ judged: 0, excluded: { singleLineTruncation: 1 } });
    return report;
  },
);

// A styled line that fits has nothing cut, so it is an ordinary long line: the first 120 characters, now in a box wide
// enough to hold them on one line.
const FITTING_BODY = FACET_BODY.slice(0, 120);
const FITTING_ROW_STYLE = FACET_ROW_STYLE.replace("width:620px", "width:1200px");

auditRuleTest(
  [{ rule: "line-length", kind: "fires", reason: "a nowrap, clipped, ellipsised line that fits cuts nothing, so its measure is still judged" }],
  "a long nowrap line that fits its box still fails line-length",
  async ({ runCli, scratch }) => {
    const body = `<span data-voice="gloss" style="${FITTING_ROW_STYLE};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${FITTING_BODY}</span>`;
    const report = await auditFixture(scratch, runCli, "facet-preview-fitting", body);
    expect(report.findings.filter(({ rule }) => rule === "line-length")).toHaveLength(1);
    expect(report.populationAccounting?.["line-length"]).toMatchObject({ judged: 1, affected: 1, excluded: {} });
  },
);

auditRuleTest(
  [{ rule: "line-length", kind: "fires", reason: "a one-line clamp over a body that already fits on one line hides nothing, so its measure is still judged" }],
  "a long line under a one-line clamp that fits still fails line-length",
  async ({ runCli, scratch }) => {
    const body = `<p data-voice="gloss" style="${FITTING_ROW_STYLE};overflow:hidden;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1">${FITTING_BODY}</p>`;
    const report = await auditFixture(scratch, runCli, "facet-preview-clamp-fitting", body);
    expect(report.findings.filter(({ rule }) => rule === "line-length")).toHaveLength(1);
    expect(report.populationAccounting?.["line-length"]).toMatchObject({ judged: 1, affected: 1, excluded: {} });
  },
);

auditRuleTest(
  [{ rule: "line-length", kind: "fires", reason: "a one-line clamp with no overflow clip paints every line, so its measure is still judged" }],
  "an unclipped one-line clamp still fails line-length",
  async ({ runCli, scratch }) => {
    const body = `<p data-voice="gloss" style="${FACET_ROW_STYLE};display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1">${FACET_BODY}</p>`;
    const report = await auditFixture(scratch, runCli, "facet-preview-clamp-unclipped", body);
    expect(report.findings.filter(({ rule }) => rule === "line-length")).toHaveLength(1);
    expect(report.populationAccounting?.["line-length"]).toMatchObject({ judged: 1, affected: 1, excluded: {} });
  },
);

auditRuleTest(
  [{ rule: "line-length", kind: "fires", reason: "the same body allowed to wrap in the same box is prose past the measure" }],
  "the same preview body wrapping in the same box still fails line-length",
  async ({ runCli, scratch }) => {
    const body = `<p data-voice="gloss" style="${FACET_ROW_STYLE};overflow:hidden">${FACET_BODY}</p>`;
    const report = await auditFixture(scratch, runCli, "facet-preview-wrapping", body);
    expect(report.findings.filter(({ rule }) => rule === "line-length")).toHaveLength(1);
    expect(report.populationAccounting?.["line-length"]).toMatchObject({ judged: 1, affected: 1, excluded: {} });
  },
);

// ── all-caps-body: a voice whose recipe rules uppercase ───────────────────────
// The Home hearth credit line names everyone in the room in the `credit` voice, which its recipe sets mono,
// uppercase and tracked. The voice is read from the element's declared `data-voice`, and the control keeps
// the same text and transform under a voice whose recipe does not set caps.
const CREDIT_LINE = "Mira Vance, Theo Lark and Juno Ashby";
const CAPS_RUN = "font-family:monospace;font-size:13px;letter-spacing:0.08em;text-transform:uppercase";

auditRuleTest(
  [
    {
      rule: "all-caps-body",
      kind: "silent",
      reason: "the credit voice's recipe sets uppercase by law, so a long credit is that voice, not body copy set in caps",
      disposition: { kind: "excluded", reason: "capsVoiceRecipe" },
    },
  ],
  "a credit line in the credit voice is excluded from all-caps-body",
  async ({ runCli, scratch }) => {
    const body = `<span data-voice="credit" style="${CAPS_RUN}">${CREDIT_LINE}</span>`;
    const report = await auditFixture(scratch, runCli, "caps-credit-voice", body);
    expect(report.populationAccounting?.["all-caps-body"]).toMatchObject({ judged: 0, excluded: { capsVoiceRecipe: 1 } });
    return report;
  },
);

auditRuleTest(
  [{ rule: "all-caps-body", kind: "fires", reason: "the same caps run in the gloss voice is running prose set in caps, which the rule exists to catch" }],
  "the same caps run in a prose voice still fails all-caps-body",
  async ({ runCli, scratch }) => {
    const body = `<p data-voice="gloss" style="${CAPS_RUN}">${CREDIT_LINE}</p>`;
    const report = await auditFixture(scratch, runCli, "caps-gloss-voice", body);
    expect(report.findings.filter(({ rule }) => rule === "all-caps-body")).toHaveLength(1);
  },
);

// ── off-theme-font: a control that previews the face it names ─────────────────
// The theme editor's font Select paints each option label in the face it names (the select's `labelStyle`),
// and the Select stamps that declaration on the label. A face the page declares anywhere else still fires,
// at that element's own selector.
const PREVIEW_FACE = "Lora";

auditRuleTest(
  [
    {
      rule: "off-theme-font",
      kind: "silent",
      reason: "a label that declares it previews the face it is painted in is the picker's design, not a stray face",
      disposition: { kind: "excluded", reason: "declaredFacePreview" },
    },
  ],
  "an open font picker's preview labels are excluded from off-theme-font",
  async ({ runCli, scratch }) => {
    const body = `<div role="listbox"><div role="option"><span ${FONT_PREVIEW_ATTRIBUTE}="${PREVIEW_FACE}" style="font-family:${PREVIEW_FACE}, serif">${PREVIEW_FACE}</span></div></div>`;
    const report = await auditFixture(scratch, runCli, "font-preview-open", body);
    expect(report.populationAccounting?.["off-theme-font"]).toMatchObject({ judged: 0, excluded: { declaredFacePreview: 1 } });
    return report;
  },
);

test("a stray face beside the picker still fires off-theme-font at its own element", async ({ runCli, scratch }) => {
  const body = `<div role="listbox"><div role="option"><span ${FONT_PREVIEW_ATTRIBUTE}="${PREVIEW_FACE}" style="font-family:${PREVIEW_FACE}, serif">${PREVIEW_FACE}</span></div></div><p id="stray" style="font-family:${PREVIEW_FACE}, serif">A heading set in a face no token names.</p>`;
  await writeFile(join(scratch, "font-preview-stray.html"), relationalDocument(body));
  const res = await runCli("snap", ["--file", join(scratch, "font-preview-stray.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  const report = await readAuditReport(res.stdout);
  expect(report.findings.filter(({ rule }) => rule === "off-theme-font")).toHaveLength(1);
  expect(findingSelectors(res.stdout, "off-theme-font")).toEqual(["#stray"]);
});

// ── caveat-outweighed: the alert's own block, and the card it sits in ─────────
// A notice's explainer under its headline is body copy of the notice, not a bounding sentence; the role must
// sit on the caveat's own block. Pairing stops at a card or list item, so a caveat in one plugin card is never
// weighed against the next card's title. The true positive is plugin-grant-list.tsx's unrecognised-permissions
// sentence: `role="alert"` on the sentence itself, beside larger copy in its own block.
const CAVEAT = "This plugin asks for 2 permissions this version doesn't recognise.";
const SMALL = "font-size:12px";
const LOUD = "font-size:16px";
const CARD = "border:1px solid #555;border-radius:8px;padding:8px;margin:8px";

auditRuleTest(
  [
    {
      rule: "caveat-outweighed",
      kind: "silent",
      reason: "a notice's explainer whose own block carries no alert role is the notice's body, not a caveat that bounds its headline",
      disposition: { kind: "excluded", reason: "alertRegionContent" },
    },
  ],
  "a notice's explainer under a status role is excluded from caveat-outweighed",
  async ({ runCli, scratch }) => {
    const body = `<div role="status"><p style="${LOUD}">Mira needs your attention</p><p style="${SMALL}">Orbweaver did not grant the extra permissions, so it stayed off.</p></div>`;
    const report = await auditFixture(scratch, runCli, "caveat-notice-explainer", body);
    expect(report.populationAccounting?.["caveat-outweighed"]).toMatchObject({ judged: 0, excluded: { alertRegionContent: 2 } });
    return report;
  },
);

auditRuleTest(
  [
    {
      rule: "caveat-outweighed",
      kind: "silent",
      reason: "a caveat in one card is judged against its own card only, so the next card's larger title is no partner",
      disposition: { kind: "judged" },
    },
    {
      rule: "caveat-outweighed",
      kind: "silent",
      reason: "the next card's title carries no alert role, so it is outside the caveat population",
      disposition: { kind: "excluded", reason: "noAuthoredCaveatClaim" },
    },
  ],
  "a caveat is not paired with a sibling card's title",
  async ({ runCli, scratch }) => {
    const body = `<div><div style="${CARD}"><p role="alert" style="${SMALL}">${CAVEAT}</p></div><div style="${CARD}"><p style="${LOUD}">Weather station</p></div></div>`;
    const report = await auditFixture(scratch, runCli, "caveat-sibling-cards", body);
    expect(report.populationAccounting?.["caveat-outweighed"]).toMatchObject({ judged: 1, affected: 0 });
    return report;
  },
);

auditRuleTest(
  [{ rule: "caveat-outweighed", kind: "fires", reason: "the grant list's own shape: an alert sentence set smaller than the capability copy in its own card" }],
  "an alert sentence outweighed inside its own card still fails caveat-outweighed",
  async ({ runCli, scratch }) => {
    const body = `<div><div style="${CARD}"><p style="${LOUD}">Read your chats</p><p role="alert" style="${SMALL}">${CAVEAT}</p></div><div style="${CARD}"><p style="${LOUD}">Weather station</p></div></div>`;
    const report = await auditFixture(scratch, runCli, "caveat-own-card", body);
    expect(report.findings.filter(({ rule }) => rule === "caveat-outweighed")).toHaveLength(1);
  },
);

auditRuleTest(
  [
    {
      rule: "caveat-outweighed",
      kind: "fires",
      reason: "a role wrapper whose whole text is the sentence carries that sentence's role, as an icon-and-text Row does",
    },
  ],
  "an alert sentence alone in a role wrapper is the caveat, and fails caveat-outweighed beside larger copy",
  async ({ runCli, scratch }) => {
    const body = `<div><p style="${LOUD}">Read your chats</p><div role="alert"><p style="${SMALL}">${CAVEAT}</p></div></div>`;
    const report = await auditFixture(scratch, runCli, "caveat-role-wrapper", body);
    expect(report.findings.filter(({ rule }) => rule === "caveat-outweighed")).toHaveLength(1);
  },
);

auditRuleTest(
  [{ rule: "all-caps-body", kind: "fires", reason: "a sentence set in a caps voice is prose in caps, which the voice's law does not cover" }],
  "a sentence in the credit voice still fails all-caps-body",
  async ({ runCli, scratch }) => {
    const body = `<span data-voice="credit" style="${CAPS_RUN}">Mira said the room was still warm when she left.</span>`;
    const report = await auditFixture(scratch, runCli, "caps-credit-sentence", body);
    expect(report.findings.filter(({ rule }) => rule === "all-caps-body")).toHaveLength(1);
  },
);

test("a face preview attribute outside a picker option declares nothing, so the face still fires off-theme-font", async ({ runCli, scratch }) => {
  const body = `<p id="loose" ${FONT_PREVIEW_ATTRIBUTE}="${PREVIEW_FACE}" style="font-family:${PREVIEW_FACE}, serif">${PREVIEW_FACE}</p>`;
  await writeFile(join(scratch, "font-preview-loose.html"), relationalDocument(body));
  const res = await runCli("snap", ["--file", join(scratch, "font-preview-loose.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  expect(findingSelectors(res.stdout, "off-theme-font")).toEqual(["#loose"]);
});

// ── undersized-ui-text: the control a label belongs to ────────────────────────
// A label is a control's when its own text is nearly all the control's text. A focusable container (a tab panel)
// or a programmatic focus target (tabindex -1, the command palette root) is no control, so an empty-state sentence
// alone inside one is body text. A label inside a real button is the control that still fires.
const MICRO = "font-size:10.5px;margin:0";
const EMPTY_LINE = "Nothing yet: when a rule fires, posts a notice, runs a tool, or you confirm a card, it shows up here.";

auditRuleTest(
  [
    {
      rule: "undersized-ui-text",
      kind: "silent",
      reason: "a sentence alone in a focusable tab panel or a tabindex -1 focus target is body text, not a control's label",
      disposition: { kind: "judged" },
    },
  ],
  "an empty-state sentence in a focusable container is judged as body text, not interactive text",
  async ({ runCli, scratch }) => {
    const body = `<div role="tabpanel" tabindex="0"><p style="${MICRO}">${EMPTY_LINE}</p></div><div tabindex="-1"><p style="${MICRO}">${EMPTY_LINE}</p></div>`;
    const report = await auditFixture(scratch, runCli, "interactive-container", body);
    expect(report.populationAccounting?.["undersized-ui-text"]).toMatchObject({ judged: 2, affected: 0 });
    return report;
  },
);

// A roving-tabindex item sits at tabindex -1 until it is highlighted, and is still its label's control.
const ROVING_ITEMS = [
  ["menu", "menuitemradio"],
  ["menu", "menuitemcheckbox"],
  ["menu", "menuitem"],
  ["listbox", "option"],
  ["tablist", "tab"],
  ["tree", "treeitem"],
] as const;

auditRuleTest(
  [{ rule: "undersized-ui-text", kind: "fires", reason: "a roving item's micro label at tabindex -1 is its control's label under the floor" }],
  "a menu, option, tab or tree item label at tabindex -1 still fails undersized-ui-text",
  async ({ runCli, scratch }) => {
    const body = ROVING_ITEMS.map(
      ([group, item]) =>
        `<div role="${group}" tabindex="-1"><div role="${item}" tabindex="-1"><span id="${item}" style="${MICRO}">Light theme</span></div></div>`,
    ).join("");
    await writeFile(join(scratch, "interactive-roving-items.html"), relationalDocument(body));
    const res = await runCli("snap", ["--file", join(scratch, "interactive-roving-items.html"), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
    expect(new Set(findingSelectors(res.stdout, "undersized-ui-text"))).toEqual(new Set(ROVING_ITEMS.map(([, item]) => `#${item}`)));
  },
);

auditRuleTest(
  [{ rule: "undersized-ui-text", kind: "fires", reason: "a button's whole label at the micro step is interactive text under the floor" }],
  "a button label at the micro step still fails undersized-ui-text",
  async ({ runCli, scratch }) => {
    const body = `<button><span style="${MICRO}">Save changes</span></button>`;
    const report = await auditFixture(scratch, runCli, "interactive-button-label", body);
    expect(report.findings.filter(({ rule }) => rule === "undersized-ui-text")).toHaveLength(1);
  },
);
