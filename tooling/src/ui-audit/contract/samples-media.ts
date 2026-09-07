// ui-audit sample shapes — the BURIED-RASTER family (media). Split from samples.ts (that file sits at
// the tooling-size boundary) per the established samples-*.ts split pattern (samples-layout.ts,
// samples-interactive.ts, samples-evidence.ts, samples-populations.ts, samples-hover.ts all exist for
// the same reason — a family's shape gets its own home instead of contesting the aggregation file).
//
// PROVENANCE: adapts pbakaus/impeccable's buried-raster RUNTIME arm only (`checkQuality`,
// cli/engine/rules/checks.mjs — Copyright 2025 Paul Bakaus, Apache License 2.0): an <img> or a
// background-image `url(...)` carrier painting at an effective opacity below ~0.15 — produced
// material that "ships" while the page shows flat colour. Their SECOND arm (a CSS-text scan for a
// raster sitting under a >=0.9-alpha gradient wash) is deliberately NOT ported: this walker has no
// stylesheet-text scanner by design (source enforcement of that shape is the gate battery's job; this
// detector judges RENDERED truth only).

/** One candidate raster carrier the walker found still painting SOMETHING (display/visibility/geometry
 *  all live — a `display:none`/`visibility:hidden` subtree is a different defect class and is filtered
 *  before this shape exists, same scope decision the `images`/`bgCandidates` census already makes).
 *  The opacity threshold itself is a Node-side verdict (`lib/checks-media.ts`) — the walker only
 *  gathers the fact. */
// ── Distorted / stretched image (impeccable `distorted-image`) ──────────────
// MOVED from contract/samples.ts (2026-09-06, #1825) — that file sat AT the 450-line tooling cap and had
// no room for the new field below.
export interface ImageDistortionInput {
  readonly selector: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly renderedWidth: number;
  readonly renderedHeight: number;
  /** Computed `object-fit`. Only "fill" stretches; "cover"/"contain" crop or letterbox and "none"/"scale-down"
   *  scale no axis (#1808) — each excluded by a named reason; off-keyword = WITHHELD (lib/checks-media.ts). */
  readonly objectFit: string;
  /** THE REAL `background-size` disposition for a background-image sample (#1825) — absent for an `<img>`
   *  sample, whose `objectFit` above is already the real computed keyword. `census-text.ts` stamps every
   *  surviving background-image candidate's `objectFit` "fill" as a neutral placeholder for the shared
   *  distortion math (cover/contain are already excluded from candidate collection), which used to leave
   *  the DEFAULT `background-size: auto` — natural size, exactly like `object-fit: none` — indistinguishable
   *  from an explicit stretch. "auto" = every axis auto (the CSS default, cannot squish); "scales" = at
   *  least one axis carries an explicit length/percentage and CAN distort, which is what the "fill" math
   *  already judges correctly. */
  readonly backgroundSizeMode?: "auto" | "scales";
}

export interface BuriedRasterInput {
  readonly selector: string;
  readonly kind: "img" | "background";
  /** Product of `opacity` over the element and its ancestors — the walker's `accumulatedOpacity`, the
   *  same composite the text census already relies on for `foregroundOpacity`. Never unresolved: the
   *  walker normalizes a non-numeric computed `opacity` to `1` before multiplying, so this field is
   *  always a real number and the check's `withheld` bucket for this rule is structurally always empty. */
  readonly effectiveOpacity: number;
  /** True when the carrier's OWN computed `transition-property` names `opacity` or `all` — the
   *  candidate may be mid-entrance (a reveal driven by a later class/data-attribute flip, e.g. a
   *  crossfade-image `revealed` toggle) rather than resting buried. See `lib/checks-media.ts` for why
   *  this EXCLUDES the candidate from judgment instead of guessing which state it is in. */
  readonly opacityTransitions: boolean;
}
