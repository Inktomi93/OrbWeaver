// The ORNAMENT-CENSUS sample shapes: decorative background patterns, the icon-tile-over-heading stack,
// and the static motion offenders.
//
// SPLIT OUT of contract/samples.ts (#1315), for the reason #797 split the interactive family: that file
// sat EXACTLY at the 450-line tooling cap, so it had no room for the form-control boundary shapes the
// `border-contrast` rule needed. This is the §4.3 decomposition, by family — samples.ts re-exports every
// name below, so no importer moves and `contract/samples.ts` remains the one door onto the walker's
// sample vocabulary.

// ── Decorative background patterns (impeccable stripes / grid fields) ────────
export interface BgPatternInput {
  readonly selector: string;
  readonly kind: "stripe" | "grid";
  readonly backgroundSize: string;
  readonly width: number;
  readonly height: number;
}

// ── Icon tile stacked above a heading (impeccable `icon-tile-stack`) ─────────
export interface IconTileInput {
  readonly headingTag: string;
  readonly headingText: string;
  readonly headingTop: number;
  readonly siblingSelector: string;
  readonly siblingWidth: number;
  readonly siblingHeight: number;
  readonly siblingBottom: number;
  readonly siblingBgAlpha: number;
  readonly siblingHasBgImage: boolean;
  readonly siblingBorderWidth: number;
  readonly siblingRadiusPx: number;
  readonly hasIconChild: boolean;
  readonly iconChildWidth: number;
}

// ── Static motion offenders (impeccable `bounce-easing` / `layout-transition`) ──
export interface MotionStaticInput {
  readonly selector: string;
  readonly kind: "bounce-name" | "overshoot-bezier" | "layout-transition";
  readonly value: string;
  /** Inside an accordion/collapsible panel — motion law §3.7 sanctions measured-var height there. */
  readonly panelExempt: boolean;
}
