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
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { CliResult, RunCliOpts } from "../../../../support/tool-fixtures.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";
import type { RelationalPopulationReport } from "../../../../support/ui-audit-relational.ts";
import { AUDIT_ARGV, auditReport, RELATIONAL_CLI_TIMEOUT_MS, relationalDocument } from "../../../../support/ui-audit-relational.ts";

/** The proof denominator the `design-audit-rule-proof` gate reads — same shape as the sibling census
 *  suites: evidence attached to an executable registration, so deleting the test deletes the proof. */
interface AuditRuleProof {
  readonly rule: string;
  readonly kind: "fires" | "silent";
  readonly reason: string;
}

interface ToolContext {
  readonly runCli: (tool: string, args: readonly string[], opts?: RunCliOpts) => Promise<CliResult>;
  readonly scratch: string;
}

function auditRuleTest(proofs: readonly AuditRuleProof[], title: string, fn: (context: ToolContext) => Promise<void>): void {
  test(title, ({ runCli, scratch }: ToolContext) => {
    expect(proofs.every((proof) => proof.reason.trim() !== "")).toBe(true);
    return fn({ runCli, scratch });
  });
}

async function auditFixture(scratch: string, runCli: ToolContext["runCli"], name: string, body: string): Promise<RelationalPopulationReport> {
  await writeFile(join(scratch, `${name}.html`), relationalDocument(body));
  const res = await runCli("snap", ["--file", join(scratch, `${name}.html`), ...AUDIT_ARGV], { timeoutMs: RELATIONAL_CLI_TIMEOUT_MS });
  return JSON.parse(await readFile(auditReport(res.stdout), "utf8")) as RelationalPopulationReport;
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
  },
);

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "silent",
      reason: "the aria-disabled spelling of the same shape — a declared-inactive control whose label is a descendant element",
    },
  ],
  "a label inside an aria-disabled control is excluded as inactive",
  async ({ runCli, scratch }) => {
    const body = `<div role="button" aria-disabled="true" style="${CONTROL_BOX}"><span style="${DIM_LABEL}">Pick one</span></div>`;
    const report = await auditFixture(scratch, runCli, "inactive-aria-descendant", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(0);
    expect(report.populationAccounting?.["contrast"]?.excluded).toMatchObject({ inactiveExempt: 1 });
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
    },
  ],
  "text a DISABLED control names via aria-labelledby is exempt",
  async ({ runCli, scratch }) => {
    const body = `<div id="nm-1" style="${DIM_LABEL_PLATE}">Volume</div><div role="slider" aria-labelledby="nm-1" aria-disabled="true" style="${CONTROL_BOX}"></div>`;
    const report = await auditFixture(scratch, runCli, "named-by-disabled", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(0);
    expect(report.populationAccounting?.["contrast"]?.excluded).toMatchObject({ inactiveExempt: 1 });
  },
);

auditRuleTest(
  [
    {
      rule: "contrast",
      kind: "silent",
      reason: "the token-list spelling: aria-labelledby names SEVERAL ids, so the reverse lookup must match a token, not the whole attribute",
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
    },
  ],
  "text inside a [data-disabled] composite root is exempt",
  async ({ runCli, scratch }) => {
    const body = `<div data-disabled style="${CONTROL_BOX}"><span style="${DIM_LABEL}">Volume</span></div>`;
    const report = await auditFixture(scratch, runCli, "vendor-disabled", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(0);
    expect(report.populationAccounting?.["contrast"]?.excluded).toMatchObject({ inactiveExempt: 1 });
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
        "a text node under a masked ancestor is withheld even at a failing ratio — resolving it flat would fabricate a ratio the mask never actually paints",
    },
  ],
  "text under a masked ancestor is withheld, not resolved flat",
  async ({ runCli, scratch }) => {
    const body = `<div style="${CONTROL_BOX};${MASK}"><span style="${DIM_LABEL}">Volume</span></div>`;
    const report = await auditFixture(scratch, runCli, "masked-ancestor", body);
    expect(report.findings.filter(({ rule }) => rule === "contrast")).toHaveLength(0);
    expect(report.populationAccounting?.["contrast"]?.withheld).toMatchObject({ maskedForeground: 1 });
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
    expect(report.populationAccounting?.["contrast"]).toMatchObject({ candidates: 2, judged: 1, withheld: { maskedForeground: 1 } });
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
    },
  ],
  "a background-image under the default background-size: auto is excluded, never judged",
  async ({ runCli, scratch }) => {
    const body = `<div style="${BG_BOX};background-size:auto"></div>`;
    const report = await auditFixture(scratch, runCli, "bg-distortion-auto", body);
    expect(report.findings.filter(({ rule }) => rule === "distorted-image")).toHaveLength(0);
    expect(report.populationAccounting?.["distorted-image"]?.excluded).toMatchObject({ objectFitDoesNotScale: 1 });
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
