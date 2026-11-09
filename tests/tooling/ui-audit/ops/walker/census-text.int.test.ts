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
import { AUDIT_ARGV, configureRelationalCliBudget, RELATIONAL_CLI_TIMEOUT_MS, readAuditReport, relationalDocument } from "@orb/testkit/node";
import type { ToolFixtures } from "@orb/testkit/tooling";
import { auditRuleTest, expect, test } from "@orb/testkit/tooling";

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
