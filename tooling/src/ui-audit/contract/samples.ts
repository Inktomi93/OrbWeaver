// The raw-sample shapes the in-page walker (ops/walker.ts) gathers and the lib/checks-* families
// judge — plain data mirroring getComputedStyle/getBoundingClientRect output. RawSamples at the
// bottom is the walker's return object, field-for-field.
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

export interface ContrastInput {
  readonly selector: string;
  readonly color: Rgb;
  readonly backdrop: Backdrop;
  readonly fontSizePx: number;
  readonly fontWeight: number;
  /** Viewport-coordinate box of the text element, present from the live walker (absent in the fixture
   *  sample sets that predate it). The pixel sampler needs it to settle an `unresolved` backdrop. */
  readonly box?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** What the compositor says is painted at this box's visible centre, when it is NOT this element (#211's
   *  test, carried only for `unresolved` samples). Non-null means a pixel sample would measure the
   *  OCCLUDER — the runner refuses the verdict instead. */
  readonly occludedBy?: string | null;
  /** How `backdrop` was arrived at. Absent/`css-resolve` = an authored background the walker resolved;
   *  `pixel-sample` = the runner read the real composited pixels because the walk was `unresolved`. The
   *  distinction is load-bearing for the rules that are about an authored COLOR rather than about
   *  luminance — see checkGrayOnColor. */
  readonly backdropMethod?: "css-resolve" | "pixel-sample";
  /** This text sits inside an `aria-hidden="true"` subtree. It is COLLECTED anyway and every rule over
   *  this sample family judges it, because contrast is a property of PIXELS and a sighted user reads
   *  decorative text exactly as well as announced text (issue #253 — three findings vanished from a scan
   *  the day their host became aria-hidden, without one pixel changing). The flag exists so an
   *  a11y-flavoured rule added here later excludes it EXPLICITLY rather than by an omission nobody can
   *  see. Optional: absent in the fixture sample sets that predate it. */
  readonly ariaHidden?: boolean;
  /** Product of `opacity` over the text element AND its ancestors. Below 1 the glyphs are painted as a
   *  BLEND of `color` and the backdrop (CSS opacity groups the subtree and composites it), while
   *  `color` still reports the undimmed value — so the ratio must be measured on the composite, exactly
   *  as snap's `--contrast` does. Optional because this type also describes samples from an older
   *  walker string (a CT pinning a historical sample set); absent reads as 1, the pre-#188 behavior. */
  readonly foregroundOpacity?: number;
}

export interface ImageDistortionInput {
  readonly selector: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly renderedWidth: number;
  readonly renderedHeight: number;
  /** Computed `object-fit` — "cover"/"contain" deliberately crop/letterbox and are excluded;
   *  only "fill" stretches to the box. */
  readonly objectFit: string;
}

// ── Broken images (impeccable `broken-image`) ───────────────────────────────
export interface BrokenImageInput {
  readonly selector: string;
  readonly reason: "empty-src" | "failed-load";
}

// ── ARIA navigability ────────────────────────────────────────────────────────
export interface TapTargetInput {
  readonly selector: string;
  readonly width: number;
  readonly height: number;
}

export interface AccessibleNameInput {
  readonly selector: string;
  readonly tag: string;
  readonly hasVisibleText: boolean;
  readonly ariaLabel: string | null;
  readonly ariaLabelledbyText: string | null;
  readonly title: string | null;
  readonly altText: string | null;
}

export interface LandmarkInput {
  readonly main: boolean;
}

export interface TabIndexInput {
  readonly selector: string;
  readonly tabIndex: number;
}

// ── Heading order (impeccable `skipped-heading`; UIP §13.10 N7 is law here) ──
export interface HeadingSample {
  readonly level: number;
  readonly text: string;
}

export interface ZIndexInput {
  readonly selector: string;
  readonly zIndex: number;
}

export interface NestedCardInput {
  readonly selector: string;
  readonly isNested: boolean;
}

export interface GradientTextInput {
  readonly selector: string;
  readonly hasGradientText: boolean;
}

export interface AnimatedImgHoverInput {
  readonly selector: string;
  readonly hasHoverAnimation: boolean;
}

// ── Typography & copy-surface floors (impeccable quality family, ramp-bound) ─
export interface TextStyleInput {
  readonly selector: string;
  readonly tag: string;
  /** Length of the element's OWN text nodes (trimmed, whitespace-collapsed). */
  readonly directTextLen: number;
  /** Length of the whole subtree's text — the line-length estimator's basis. */
  readonly totalTextLen: number;
  readonly fontSizePx: number;
  readonly lineHeightPx: number | null;
  readonly letterSpacingPx: number;
  readonly textTransform: string;
  /** The element's own text RENDERS as caps — typed that way, not just `text-transform: uppercase`.
   *  Optional because this type also describes samples from an older walker string (a CT pinning a
   *  historical sample set); absent reads as "not caps", i.e. the pre-#148 behavior. */
  readonly capsText?: boolean;
  readonly textAlign: string;
  readonly hyphens: string;
  readonly rectWidth: number;
  /** p/li/td/th/dd/blockquote/figcaption — the prose tags line-length judges. */
  readonly isProseTag: boolean;
  readonly isHeading: boolean;
  /** This text is an interactive control's PRIMARY label (its direct text ≈ the control's whole
   *  text) — not merely text inside an interactive ancestor: a micro-voice caption inside a large
   *  clickable card is the ratified gloss voice and does NOT owe the 11px control floor. */
  readonly interactive: boolean;
  /** Inside pre/code/kbd/samp/var/svg — glyphs that are DATA or GEOMETRY, which the type ramp does not
   *  govern. `aria-hidden` was in this selector until issue #253 and must never return: it is an
   *  accessibility-tree fact, and using it as a type-floor exemption silently excused every
   *  decorative-but-rendered string in the product. */
  readonly codeContext: boolean;
  /** Screen-reader-only text — exempt from everything here (it paints no pixels to judge). Either
   *  shape: a clipped visually-hidden state (`clip-path: inset(50%)` / `clip: rect(0,0,0,0)` over a
   *  clipping overflow — the `sr-only` posture, which keeps a FULL-SIZE box), or a ≤2px plumbing box. */
  readonly srOnly: boolean;
  /** Inside an `aria-hidden="true"` subtree — JUDGED ANYWAY by every rule here (issue #253). This family
   *  is entirely VISUAL (size, leading, tracking, measure, caps, justification): all of it is pixels a
   *  sighted user reads whether or not a screen reader announces it, and the opposite posture cost three
   *  live findings the day their host was correctly marked aria-hidden. Contrast with `srOnly`, which IS
   *  an exemption — clipped text paints no pixels at all. Optional: absent in older fixture sample sets. */
  readonly ariaHidden?: boolean;
}

// ── Accent borders (impeccable `side-tab` / `border-accent-on-rounded`) ──────
export interface AccentBorderInput {
  readonly selector: string;
  readonly tag: string;
  readonly widths: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
  readonly colors: {
    readonly top: Rgb | null;
    readonly right: Rgb | null;
    readonly bottom: Rgb | null;
    readonly left: Rgb | null;
  };
  readonly radius: number;
  readonly badgeLike: boolean;
  readonly tabContext: boolean;
  readonly statusContext: boolean;
}

// ── Chromatic glow shadows (impeccable `dark-glow`, sanctioned axes exempt) ──
// LIMITATION (deliberate): colors that serialize outside rgb()/rgba() (oklch tokens) are
// SKIPPED, never guessed — the sanctioned owner glow rides token colors on ::before layers and
// must not FP here; a violation authored in raw rgb/hex (the only way past the tokens-only
// source gate) is exactly what still parses.
export interface GlowShadowInput {
  readonly selector: string;
  readonly boxShadow: string;
  readonly textShadow: string;
  readonly backdropColor: Rgb | null;
}

// ── Radial-gradient washes (impeccable `radial-halo` / `radial-spotlight-glow`) ──
// Sanctioned carriers (tagged by the walker off the owner effect axes) are exempt; the same
// rgb/hex-only parsing honesty as glow-shadow applies.
export interface RadialGlowInput {
  readonly selector: string;
  readonly value: string;
  readonly width: number;
  readonly height: number;
  readonly sanctioned: boolean;
}

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

// ── Page censuses: fonts + type-scale spread (impeccable adapted, ramp-bound) ──
export interface FontCensusInput {
  readonly families: readonly string[];
  readonly sizes: readonly number[];
}

// ── Text overflow (impeccable `text-overflow` — the walker measured the spill) ──
export interface TextOverflowInput {
  readonly selector: string;
  readonly spillPx: number;
  readonly mode: "block" | "inline";
}

// ── Repeated literal text in one container (impeccable `repeated-container-text`) ──
export interface RepeatedTextInput {
  readonly containerSelector: string;
  readonly text: string;
  readonly count: number;
  readonly distinctSigs: number;
}

// ── Clipping container vs positioned child (impeccable `clipped-overflow-container`) ──
export interface ClippedOverflowInput {
  readonly selector: string;
  readonly childSelector: string;
}

// ── Cards flush against a scroller edge (impeccable `edge-flush-cards`) ───────
export interface EdgeFlushInput {
  readonly scrollerSelector: string;
  readonly cardSelector: string;
  readonly edge: "left" | "right";
  readonly gapPx: number;
  readonly count: number;
}

// ── Duplicate action doors — the RUNTIME half of issue #252 ─────────────────────────────────────────
// "New chat lives in three places." The STATIC gate (`duplicate-action-doors`, tooling/src/verify/gates) censuses
// tRPC call sites per rail section and is blind by construction to a REGISTRY-RENDERED action — one call site
// behind N rendered slots, which is precisely how the founding complaint escapes it (its three doors all
// call one shared state action). This lens is the other half: the same (role, accessible name) OFFERED more
// than once on one rendered plane. Neither arm subsumes the other — the static one catches one verb wearing
// N different labels, this one catches one label rendered N times from one verb.
//
// NOTHING IS HARDCODED. The key is the control's own computed name; no procedure or affordance is named here.
//
// THE FALSE-POSITIVE CLASS IS PER-DATUM REPETITION — twelve "Open" buttons in a chat list are twelve
// different chats, not twelve doors to one action — and the discriminator is STRUCTURAL PATH. Per-datum
// instances are rendered by ONE piece of code, so their paths from the root are IDENTICAL; genuinely
// separate homes (a hero CTA, a rail button, a topbar glyph) are reached by DIFFERENT paths. A twin-SIBLING
// count was tried first and refused with a receipt: keyed on tag+class it reads two bare wrapper divs as a
// list and swallowed every door on a three-door stage.
export interface ActionDoorInput {
  readonly selector: string;
  /** Explicit `role`, else the implicit role of the tag (`input:<type>` for inputs). */
  readonly role: string;
  /** The accessible name as a COMPARISON KEY: case-folded, whitespace-collapsed, trailing punctuation
   *  stripped. Never empty — an unnamed control is the `aria-name` rule's finding, not this one. */
  readonly name: string;
  /** The chain of tag@data-slot.classes signatures from this control up to `<body>`, POSITION-FREE.
   *  Two doors sharing a path are one component rendered per datum; two doors with different paths are two
   *  homes. */
  readonly path: string;
}

// ── Control silhouette (orbweaver; #430, from the side-eye #420 receipts) ────────────────────────────
// A track control's SHAPE is an affordance: a switch reads as a switch because the track is a lane long
// enough for the thumb to travel in. When the box collapses toward square the lane disappears and the
// control reads as a glyph — measured live at 48x44 (aspect 1.091), which a reviewer read as a crescent
// moon rather than a toggle (docs/reviews/side-eye/2026-08-22-switch-shape-and-glow-evidence.md).
//
// The walker censuses EVERY explicitly-roled visible element and hands the raw box over; which roles owe
// a directional silhouette is a Node-side decision (lib/checks-a11y.ts) so the two cannot drift — a role
// added to the verdict table needs no walker edit, which is the coupled site this shape exists to avoid.
export interface ControlAspectInput {
  readonly selector: string;
  /** The element's explicit `role` attribute, trimmed and case-folded. Explicit only: an implicit role is
   *  not a claim the author made about the control's silhouette. */
  readonly role: string;
  readonly width: number;
  readonly height: number;
  /** An animation or transition was RUNNING on this element when the box was read. A mid-flight box is a
   *  measurement of a moment, not of a design — the check declines rather than judging it (the same
   *  mid-transition trap that produced a retracted "widening does not restore travel" reading in #420). */
  readonly animating: boolean;
}

// ── Aggregation ──────────────────────────────────────────────────────────────
export interface RawSamples {
  readonly texts: readonly ContrastInput[];
  readonly images: readonly ImageDistortionInput[];
  readonly tapTargets: readonly TapTargetInput[];
  readonly accessibleNames: readonly AccessibleNameInput[];
  /** Named, offered, non-per-datum controls — the runtime dual-home lens (#252). Optional: absent from the
   *  fixture sample sets that predate it, where it reads as "no doors censused". */
  readonly actionDoors?: readonly ActionDoorInput[];
  readonly mainLandmarkPresent: boolean;
  readonly tabIndexes: readonly TabIndexInput[];
  readonly zIndexes: readonly ZIndexInput[];
  readonly nestedCards: readonly NestedCardInput[];
  readonly gradientTexts: readonly GradientTextInput[];
  readonly animatedImgHovers: readonly AnimatedImgHoverInput[];
  /** Every explicitly-roled visible element's rendered box — the silhouette lens (#430). Optional: absent
   *  from the fixture sample sets that predate it, where it reads as "no roled controls censused". */
  readonly controlAspects?: readonly ControlAspectInput[];
  /** Whether the page was measured under `(pointer: coarse)` — selects the tap-target floor. */
  readonly pointerCoarse: boolean;
  readonly textStyles: readonly TextStyleInput[];
  readonly accentBorders: readonly AccentBorderInput[];
  readonly shadowGlows: readonly GlowShadowInput[];
  readonly radialGlows: readonly RadialGlowInput[];
  readonly bgPatterns: readonly BgPatternInput[];
  readonly iconTiles: readonly IconTileInput[];
  readonly motionStatics: readonly MotionStaticInput[];
  readonly fontCensus: FontCensusInput;
  readonly brokenImages: readonly BrokenImageInput[];
  readonly headings: readonly HeadingSample[];
  readonly overflows: readonly TextOverflowInput[];
  readonly repeatedTexts: readonly RepeatedTextInput[];
  readonly clippedOverflows: readonly ClippedOverflowInput[];
  readonly edgeFlushCards: readonly EdgeFlushInput[];
}
