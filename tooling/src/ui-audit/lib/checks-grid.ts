// The DEVICE-PIXEL GRID verdicts (docs/law/integer-line-boxes.md §9-§11 — the crispness doctrine's
// Laws 2, 3 and 4). The walker (ops/walker/census-grid.ts) gathers landings only; every threshold lives
// here so it is unit-testable without a browser, and every arm is DPR-parameterized through the sample's
// already-normalized device fractions rather than through a per-arm constant.
//
// WHY THIS IS A RUNTIME RULE AND NOT A GATE (the doctrine's own axis, ops/walker/census-tier.ts's header
// verbatim: "THE QUESTION IS NOT 'is this value legal' … It is 'did the RESOLVED pixel match'"). A landing
// is the product of the live root font-size (the continuous `--appearance-font-scale` slider, docs/law/integer-line-boxes.md
// §2.1), the element's own box, and the device pixel ratio — none of which authorship can see. The
// AUTHORSHIP-provable half of Law 2 in a stylesheet is stylelint `orb/rest-transform-grid`; this is
// the resolved half plus Laws 3 and 4, which have no authorship half at all.
import type { Finding } from "../contract/findings.ts";
import type { OffGridTextInput, OffGridTransformInput, PromotedLayerOffsetInput } from "../contract/samples-grid.ts";
import type { AuditEngine } from "../contract/types.ts";

/** Tolerance on a DEVICE-pixel fraction. `getBoundingClientRect` returns exact doubles (unlike the
 *  TRUNCATED `getComputedStyle` strings that forced lib/ramp.ts's larger `LEADING_FLOOR_EPSILON`), so this
 *  covers float noise from the `* dpr` multiply only. The smallest fraction the founding defect produced
 *  was 0.125 device px — two orders of magnitude above this — so no real landing hides under it. */
const GRID_EPSILON_DEVICE_PX = 0.001;
export const GRID_EPSILON_DEVICE_PX_JS = JSON.stringify(GRID_EPSILON_DEVICE_PX);

/** A resolved scale is "none" within this — a matrix decomposition of an identity transform can come back
 *  as 0.9999999999 through a rotate/skew round trip. */
const SCALE_IDENTITY_EPSILON = 1e-6;
export const SCALE_IDENTITY_EPSILON_JS = JSON.stringify(SCALE_IDENTITY_EPSILON);

/** Reported precision. A device fraction is meaningful to ~0.001 (the epsilon); a scale factor to ~1e-4. */
const FRACTION_DIGITS = 3;
const SCALE_DIGITS = 4;

/** THE RUNTIME MIRROR of the source exemption — NEVER a second decision. The reviewed stylelint disable in
 *  `packages/client/src/styles/globals.css` exempts `var(--appearance-reading-line-height)`; that declaration
 *  sits on `[data-slot="message-bubble"]`, so the same user-owned continuous multiplier decides every text
 *  landing inside the bubble. Two-sidedness at runtime is the ACCOUNTING, not a stale arm: the exclusion is
 *  counted and printed per run (#987 — "an N/A cohort cannot silently disappear from the denominator"), so
 *  a surface with bubbles and a zero `readingSurface` count is visible as an instrument problem. The row
 *  ends when the reading rule gains its own round() belt at the consuming declaration — the same end
 *  condition the source exemption carries. */
export const GRID_EXEMPTIONS = {
  readingSurface: {
    selector: '[data-slot="message-bubble"]',
    why:
      "the chat reading surface is the user-owned CONTINUOUS multiplier (appearance.readingLineHeight " +
      "1.2-2.2) — the declared Law-4 residual of docs/law/integer-line-boxes.md §2, mirrored from the " +
      "reviewed stylelint declaration-property-value-allowed-list disable in packages/client/src/styles/globals.css; " +
      "ends when the reading rule gains its own round() belt at the consuming declaration",
  },
} as const;

/** The page-side expression the walker interpolates, so the exempt surface is spelled EXACTLY ONCE across
 *  the Node verdict layer and the in-page census (the `INACTIVE_KIND_EXPR` precedent, floor/instrument/wcag.ts). */
export const GRID_READING_SURFACE_SELECTOR_JS = JSON.stringify(GRID_EXEMPTIONS.readingSurface.selector);

/** The Law 3 and Law 4 exclusion for every promoted layer, in Chromium only. Chromium (GPU and software raster)
 *  paints a `backdrop-filter` layer's fraction into its content and snaps a `will-change` or 3D layer to the
 *  device-pixel grid, so no glyph is resampled (docs/law/integer-line-boxes.md §10). Other engines stay judged. */
export const GRID_COMPOSITED_WITHOUT_RESAMPLE = "compositedWithoutResample";
export const GRID_COMPOSITED_WITHOUT_RESAMPLE_JS = JSON.stringify(GRID_COMPOSITED_WITHOUT_RESAMPLE);
/** The one engine that measurement covers. */
const GRID_MEASURED_ENGINE = "chromium" satisfies AuditEngine;
export const GRID_MEASURED_ENGINE_JS = JSON.stringify(GRID_MEASURED_ENGINE);

/** The Law 2 exclusion for a unity-scale transform whose own translation is whole device pixels: the landing is
 *  the one the box had before the transform, so the layout that placed the box owns any fraction in it (§9). */
export const GRID_INHERITED_LANDING = "inheritedLanding";
export const GRID_INHERITED_LANDING_JS = JSON.stringify(GRID_INHERITED_LANDING);

/** The Law 4 collapse for text that lands where its layer put it: the layer's own Law 3 row files that fraction (§10). */
export const GRID_COLLAPSED_INTO_LAYER = "promotedLayer";

function offGrid(input: { readonly topDeviceFrac: number; readonly leftDeviceFrac: number }): boolean {
  return Math.abs(input.topDeviceFrac) > GRID_EPSILON_DEVICE_PX || Math.abs(input.leftDeviceFrac) > GRID_EPSILON_DEVICE_PX;
}

function landingText(input: { readonly topDeviceFrac: number; readonly leftDeviceFrac: number; readonly dpr: number }): string {
  return `top ${input.topDeviceFrac.toFixed(FRACTION_DIGITS)} / left ${input.leftDeviceFrac.toFixed(FRACTION_DIGITS)} device px off the grid at DPR ${String(input.dpr)}`;
}

/** LAW 4 — the runtime backstop. Text inside a promoted layer is rasterized ONCE at the layer's own
 *  sub-pixel position: the browser's per-paint baseline snapping is off, so the fraction is resampled and
 *  the anti-aliasing degrades. It is invisible to every source-side scan because the authored line box,
 *  spacing and font size can all be perfectly legal tokens. Text OUTSIDE a promotion context, or inside any
 *  promoted layer in Chromium, is EXCLUDED in the page, not judged clean here. */
export function checkOffGridText(input: OffGridTextInput): Finding | null {
  if (!offGrid(input)) {
    return null;
  }
  return {
    rule: "off-grid-text",
    severity: "P2",
    selector: input.selector,
    value: `${String(input.fontSizePx)}px text lands ${landingText(input)} inside a ${input.promotion} layer (${input.promotedBy})`,
    message: `this text is painted inside a promoted layer, which turns OFF the browser's per-paint baseline snapping — so its sub-pixel offset is rasterized and resampled instead of corrected, and the glyphs blur. Land the promoting ancestor on the device-pixel grid (the repair is at ${input.promotedBy}, not here), or drop the promotion if nothing needs it. See docs/law/integer-line-boxes.md §11`,
    origin: "orbweaver",
  };
}

/** The Law 3 row that already owns this text's fraction, or null when the text's own offset in its layer is off the
 *  grid, or the layer has no off-grid Law 3 row. Device fractions subtract modulo one device pixel. */
export function offGridTextOwner(input: OffGridTextInput): typeof GRID_COLLAPSED_INTO_LAYER | null {
  const layer = input.layerLanding;
  if (layer === undefined || !offGrid(layer)) {
    return null;
  }
  const relative = (text: number, host: number): number => text - host - Math.round(text - host);
  const own = { topDeviceFrac: relative(input.topDeviceFrac, layer.topDeviceFrac), leftDeviceFrac: relative(input.leftDeviceFrac, layer.leftDeviceFrac) };
  return offGrid(own) ? null : GRID_COLLAPSED_INTO_LAYER;
}

/** LAW 3 — a promoted layer is composited from ONE raster, so its own fractional offset is inherited by
 *  every glyph inside it. This is the CAUSE half of the Law-4 finding above, filed against the layer that
 *  can actually be fixed. No authorship half exists: the offset is decided by layout. */
export function checkPromotedLayerOffset(input: PromotedLayerOffsetInput): Finding | null {
  if (!offGrid(input)) {
    return null;
  }
  // A PSEUDO-CARRIED promotion is the same defect with a different repair site: the layer is generated
  // content with no box of its own to move, so the fix is the HOST's landing (or the pseudo's own inset),
  // never "nudge the ::before". #1154's shell panes are the shape that made this arm exist (#1172).
  const carrier = input.pseudo === undefined ? "this element promotes itself" : `this element's ${input.pseudo} promotes itself`;
  const repair =
    input.pseudo === undefined
      ? "Give the layer an integer offset (an integer line box above it, an integer-resolving spacing step, or a layout that does not divide an odd length), or drop the promotion."
      : `Give the HOST an integer landing, or the ${input.pseudo} an inset that resolves to one — the pseudo has no box of its own to move — or drop the promotion.`;
  return {
    rule: "promoted-layer-offset",
    severity: "P2",
    selector: input.selector,
    value: `${input.promotion} layer lands ${landingText(input)}`,
    message: `${carrier} to its own composited layer (${input.promotion}), which disables baseline snapping for its whole subtree — and it lands off the device-pixel grid, so every glyph and edge inside it is resampled at that same fraction. ${repair} See docs/law/integer-line-boxes.md §10`,
    origin: "orbweaver",
  };
}

/** LAW 2 (resolved arm) — a transform AT REST must be identity-preserving on the grid. Two flavours: a
 *  resting SCALE resamples the subtree's raster permanently whatever the offset is, and a translation that
 *  lands the box between device pixels blurs it exactly like a promoted layer. A transform that is mid
 *  animation or transition is excluded in the page (#987's animating rule), never judged here. */
export function checkOffGridTransform(input: OffGridTransformInput): Finding | null {
  const scaled = Math.abs(input.scaleX - 1) > SCALE_IDENTITY_EPSILON || Math.abs(input.scaleY - 1) > SCALE_IDENTITY_EPSILON;
  const offGridTranslation = input.translated && offGrid(input);
  if (!(scaled || offGridTranslation)) {
    return null;
  }
  const cause = scaled ? `a resting scale (${input.scaleX.toFixed(SCALE_DIGITS)} x ${input.scaleY.toFixed(SCALE_DIGITS)})` : "a resting translation";
  return {
    rule: "off-grid-transform",
    severity: "P3",
    selector: input.selector,
    value: `${cause} — "${input.transform}" lands ${landingText(input)}`,
    message: `this element carries a transform at REST, and the raster it produces does not sit on the device-pixel grid: a resting scale resamples every glyph and edge under it for the element's whole life, and a fractional resting translation offsets the same raster between pixels. Transforms belong to MOTION (a state variant or a @keyframes stop) — express rest geometry as layout instead. See docs/law/integer-line-boxes.md §9`,
    origin: "orbweaver",
  };
}
