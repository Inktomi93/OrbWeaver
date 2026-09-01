// The resolved-backdrop primitive, split out of samples.ts (2026-09-01) to break a type-only import
// CYCLE that `no-circular` reds: `samples-hover.ts` needs `Backdrop`, and `samples.ts` composes the hover
// shapes into `RawSamples`, so homing `Backdrop` in the aggregator made each side import the other. This
// file depends only on `_shared/wcag`, so both sides reach it without one. samples.ts re-exports it, so
// its existing consumers are unchanged.

import type { Rgb } from "@orb/tooling/_shared/wcag";

/** Resolved backdrop behind a text node — `flat` (solid ancestor bg), `gradient` (worst-stop
 *  ratio over OPAQUE stops; translucent stops refuse as indeterminate),
 *  `image-indeterminate` (a url() layer — incl. gradient-over-image composites — has no cheap
 *  DOM-only pixel sample, so it's flagged rather than silently passed), or `unresolved` — the DOM
 *  walk found no trustworthy base at all (issue #218).
 *
 *  `unresolved` IS NOT A VERDICT AND MUST NOT REACH A RATIO. It means the walker knows it cannot know:
 *  either nothing opaque backs the chain, or a fixed/absolute PAINT LAYER (the app's wallpaper photo)
 *  sits between the opaque base it found and the glyph. design-audit.ts settles these by sampling the
 *  element's real pixels (`resolvePixelBackdrops`) and rewriting the sample to `flat` before
 *  `collectFindings` ever sees it; one that survives to here is one the runner REFUSED (off-screen box,
 *  failed shot) and reported as an explicit NO-VERDICT row, so the checks below stay silent rather than
 *  minting a number from `fallback`. `fallback` is the pre-#218 fabricated composite, kept ONLY for the
 *  non-verdict tells (the dark-glow "is this backdrop dark" question). */
export type Backdrop =
  | { readonly kind: "flat"; readonly color: Rgb }
  | { readonly kind: "gradient"; readonly stops: readonly Rgb[] }
  | { readonly kind: "image-indeterminate" }
  | { readonly kind: "unresolved"; readonly reason: "paint-layer-over-base" | "no-opaque-base"; readonly fallback: Rgb };

// ── Chromatic glow shadows (impeccable `dark-glow`, sanctioned axes exempt) ──
// Moved here from samples.ts (2026-09-01) with `Backdrop`'s cycle-break rationale: samples-hover.ts
// needs these shapes and the aggregator needs samples-hover's — the leaf is the one home both reach.
// THE OLD "LIMITATION (deliberate)" HERE WAS THE BUG, NOT A LIMIT (2026-09-01). It read: "colors
// that serialize outside rgb()/rgba() (oklch tokens) are SKIPPED, never guessed — the sanctioned
// owner glow rides token colors on ::before layers and must not FP here". That reasoning inverts:
// our tokens are OKLCH-only and raw colours are gate-RED at source, so skipping OKLCH did not
// protect the sanctioned carriers, it made the rule incapable of firing on anything this app can
// author. Colours now read through `lib/css-color.ts`; FP safety comes from `sanctioned`, the same
// walker-tagged carrier flag `RadialGlowInput` has always had.
export interface GlowShadowInput {
  readonly selector: string;
  readonly boxShadow: string;
  readonly textShadow: string;
  readonly backdropColor: Rgb | null;
  /** Walker-tagged exempt: an owner effect carrier, or a pseudo sample that is a DEDICATED glow layer —
   *  a MECHANISM, never a name list; derived and justified in `ops/walker/census-glow.ts`. Optional so a
   *  pre-2026-09-01 fixture bundle keeps its verdict instead of silently reading as exempt. */
  readonly sanctioned?: boolean;
}

// ── Radial-gradient washes (impeccable `radial-halo` / `radial-spotlight-glow`) ──
// Sanctioned carriers (tagged by the walker off the owner effect axes) are exempt. Colour reading is
// `lib/css-color.ts`'s job for this family too — the old rgb/hex-only note here described the same
// blindness the glow block above records.
export interface RadialGlowInput {
  readonly selector: string;
  readonly value: string;
  readonly width: number;
  readonly height: number;
  readonly sanctioned: boolean;
}
