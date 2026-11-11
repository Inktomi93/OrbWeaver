// ui-audit sample shapes — the DEVICE-PIXEL GRID family (docs/law/integer-line-boxes.md §9-§11, the
// crispness doctrine's Laws 2-4). Separate from samples-layout.ts
// because these are RESOLVED-PIXEL
// landings, not rendered-layout relations.
//
// EVERY FRACTION IS IN DEVICE PIXELS, SIGNED, AND ALREADY NORMALIZED IN THE PAGE (ops/walker/census-grid.ts):
// `frac = value * devicePixelRatio - round(value * devicePixelRatio)`, so |frac| <= 0.5 and a DPR-2 landing
// on a CSS half-pixel reads 0 — crisp — while the same CSS box at DPR 1 reads 0.5. That normalization is
// what makes one epsilon in lib/checks-grid.ts correct at every DPR arm; a checker comparing raw CSS
// offsets would have to re-derive the device grid and would answer differently per arm.

/** The promotion shapes Law 3 judges (docs/law/integer-line-boxes.md §10). In Chromium the walker emits none of
 *  them: it excludes every promoted layer as `compositedWithoutResample`. Elsewhere each is judged. */
export const GRID_PROMOTION_KINDS = ["will-change", "3d", "backdrop-filter"] as const;
type GridPromotionKind = (typeof GRID_PROMOTION_KINDS)[number];

/** One text element painting inside a promotion context that has disabled per-paint baseline snapping —
 *  the Law-4 backstop's judged subject. `promotion`/`promotedBy` name WHICH ancestor turned snapping off,
 *  because that ancestor is where the repair lands (Law 3), not the text. */
export interface OffGridTextInput {
  readonly selector: string;
  /** Authored identity (#983/#989's pair) — a blurred voice is a property of the COMPONENT, not of each
   *  render, so the collector groups by it instead of filing one finding per rendered instance. */
  readonly authoredTarget?: string;
  readonly authoredHome?: string;
  readonly dpr: number;
  readonly topDeviceFrac: number;
  readonly leftDeviceFrac: number;
  readonly promotion: GridPromotionKind;
  readonly promotedBy: string;
  /** The promoting layer's own device fractions, present when Law 3 judges that layer. Text that lands where the
   *  layer put it collapses into the layer's row. */
  readonly layerLanding?: { readonly topDeviceFrac: number; readonly leftDeviceFrac: number };
  readonly fontSizePx: number;
}

/** One promotion ROOT outside Chromium (`will-change`, a 3D-promoted layer, or `backdrop-filter`) and its own landing — the
 *  Law-3 subject. A promoted layer is rasterized once and composited, so ITS fraction is inherited by every
 *  descendant glyph: fixing the root fixes the subtree, which is why the root is judged separately. */
export interface PromotedLayerOffsetInput {
  readonly selector: string;
  readonly authoredTarget?: string;
  readonly authoredHome?: string;
  readonly dpr: number;
  readonly topDeviceFrac: number;
  readonly leftDeviceFrac: number;
  readonly promotion: GridPromotionKind;
  /** `"::before"` / `"::after"` when the promotion is carried by a PSEUDO of the subject rather than by the
   *  subject itself (#1172). The selector already names it; this carries the fact separately so the finding
   *  can say WHERE the repair goes — a pseudo has no box to move, so the host's landing is the thing that
   *  has to change. Absent = an element-carried promotion, the original arm. */
  readonly pseudo?: string;
}

/** One element carrying a non-identity transform AT REST — the Law-2 resolved arm. `scaleX`/`scaleY` are
 *  the resolved matrix's scale components (1 = none); `translated` says the matrix carries a translation.
 *  A transform mid-animation is never a rest landing and is excluded in the page, never judged here. */
export interface OffGridTransformInput {
  readonly selector: string;
  readonly authoredTarget?: string;
  readonly authoredHome?: string;
  readonly dpr: number;
  readonly topDeviceFrac: number;
  readonly leftDeviceFrac: number;
  readonly transform: string;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly translated: boolean;
}
