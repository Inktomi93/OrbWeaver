// The raw-sample shapes the in-page walker (ops/walker.ts) gathers and lib/checks-* judge — plain data
// mirroring getComputedStyle/getBoundingClientRect. RawSamples at the bottom is the walker's return object.
import type { InactiveKind, Rgb } from "@orb/tooling/_shared/wcag";
// `Backdrop` MOVED to contract/backdrop.ts (see its header). Imported locally because the shapes below
// USE it, and re-exported below so its consumers keep one import.
import type { Backdrop, GlowShadowInput, RadialGlowInput } from "./backdrop.ts";
import type { ObscuredScanInput, SubjectAccountingInput, ThemeRenderInput } from "./samples-evidence.ts";
// `RawSamples` at the bottom COMPOSES the split families' shapes, so they are imported here as well as
// re-exported below: a bare `export … from` re-exports a name without binding it locally (tsc catches
// that; biome's type service does not).
import type {
  AccessibleNameInput,
  ActionDoorInput,
  BorderContrastInput,
  CensusReachInput,
  ControlAspectInput,
  TabIndexInput,
  TapTargetInput,
} from "./samples-interactive.ts";
import type { BgPatternInput, IconTileInput, MotionStaticInput } from "./samples-ornament.ts";
import type { CensusCapAccountingInput, RelationalSamples } from "./samples-populations.ts";

export type { Backdrop, GlowShadowInput, RadialGlowInput } from "./backdrop.ts";

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
  /** How this text's control is INACTIVE, if it is (#624). WCAG 1.4.3 exempts inactive user interface
   *  components from the contrast minimum, and `snap --contrast` has always honoured that — design-audit
   *  did not, so it filed a P1 at 2.64:1 on the very element snap reported as `SKIPPED inactive control`.
   *  Every disabled control in the app was a standing false positive, which teaches a reader to discount
   *  the instrument's P1s. Classified by the ONE shared classifier (`_shared/wcag.ts` `INACTIVE_KIND_EXPR`)
   *  so the two instruments cannot drift again. Optional: absent in the fixture sample sets that predate
   *  it, and absent reads as `"none"`. */
  readonly inactive?: InactiveKind;
  /** Product of `opacity` over the text element AND its ancestors. Below 1 the glyphs are painted as a
   *  BLEND of `color` and the backdrop (CSS opacity groups the subtree and composites it), while
   *  `color` still reports the undimmed value — so the ratio must be measured on the composite, exactly
   *  as snap's `--contrast` does. Optional because this type also describes samples from an older
   *  walker string (a CT pinning a historical sample set); absent reads as 1, the pre-#188 behavior. */
  readonly foregroundOpacity?: number;
  /** Text/ancestor carries `mask-image` (#1078, `.scroll-fade-x/-y`); absent = unmasked. */ readonly foregroundMasked?: boolean;
}

export interface ImageDistortionInput {
  readonly selector: string;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
  readonly renderedWidth: number;
  readonly renderedHeight: number;
  /** Computed `object-fit`. Only "fill" stretches to the box, so every other keyword is excluded by a
   *  named reason: "cover"/"contain" deliberately crop/letterbox, and "none"/"scale-down" scale no axis
   *  independently at all (#1808 — they were judged as if they stretched until then). A value outside the
   *  keyword space is a measurement that did not arrive and is WITHHELD (lib/checks-media.ts). */
  readonly objectFit: string;
}

// ── Broken images (impeccable `broken-image`) ───────────────────────────────
export interface BrokenImageInput {
  readonly selector: string;
  readonly reason: "empty-src" | "failed-load";
}

export type { ObscuredScanInput, SubjectAccountingInput, ThemeRenderInput } from "./samples-evidence.ts";
// ── The interactive census (tap targets · names · landmark · tabindex · doors · silhouettes · reach) ──
// Re-exported, not re-declared: these shapes moved to contract/samples-interactive.ts when this file hit
// the 450-line tooling cap (#797). `contract/samples.ts` stays the one door onto the sample vocabulary —
// and the import beside the re-export is load-bearing, because `RawSamples` below composes these names
// (a bare `export … from` re-exports without binding them locally, which tsc catches and biome does not).
export type {
  AccessibleNameInput,
  ActionDoorInput,
  BorderContrastInput,
  BorderContrastSide,
  CensusReachInput,
  ControlAspectInput,
  LandmarkInput,
  TabIndexInput,
  TapTargetInput,
} from "./samples-interactive.ts";
// ── The relational census (sibling cohorts) ──────────────────────────────────────────────────────────
// Same split reason as the interactive family above, and the same import-beside-re-export rule:
// `RawSamples` composes this name, so it is bound locally at the top of the file as well.
export type { CohortAnatomyInput, EmptyStateInput, PaneInkInput, QuietStateInput, RowVoidInput, SelectionIdiomInput } from "./samples-layout.ts";

// ── Heading order (impeccable `skipped-heading`; UIP §13.10 N7 is law here) ──
export interface HeadingSample {
  /** The walker's locatable selector for THIS heading (#1317 item 5). cli.ts's own law is that every
   *  finding carries a locatable selector; a skipped-heading whose selector read "h3" named a TAG, not
   *  an element, so a reader could not open the offender on any page with more than one h3 — which is
   *  every page. The walker holds the element and already spends describe() on every other family. */
  readonly selector: string;
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
  /** Stable authored-decision identity. Optional only for fixture bundles predating #989. */
  readonly authoredTarget?: string;
  /** Position-free structural home paired with `authoredTarget`; optional for historical fixtures. */
  readonly authoredHome?: string;
  readonly tag: string;
  /** Length of the element's OWN text nodes (trimmed, whitespace-collapsed). */
  readonly directTextLen: number;
  /** That same text, capped at 120 chars. Carried for the caveat rule (#652), which needs SHAPE and not
   *  just length: a bounding sentence and a qualifier fragment occupy the same length class, and the
   *  terminal punctuation is the only DOM-visible tell. Optional: absent in older fixture sample sets,
   *  where the rule declines rather than treating a fragment as a sentence. */
  readonly directText?: string;
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
  /** The MEASURED advance of one `0` in this element's own font — the CSS `ch` unit, from an in-page
   *  canvas `measureText` (#464). It replaces a guessed `fontSize × 0.5`: Geist's real ratio is 0.573,
   *  so the guess over-estimated every measure by ~15% and the rule indicted the house's own ratified
   *  `--reading-measure: 75ch`. `0` means the measurement did not happen — read as NO VERDICT, never as
   *  a narrow line. Optional because this type also describes samples from an older walker string. */
  readonly chWidthPx?: number;
  /** The AVERAGE advance of one character of THIS element's own running text, canvas-measured in its own
   *  font (#1183). It is the design law's unit — skill §2 counts "65-75 characters" by average glyph
   *  advance — and it is NOT `chWidthPx`: a `0` is 0.6625em in Geist while running prose averages
   *  0.42-0.46em, so a box holds ~1.5x as many law-characters as CSS `ch` and a ceiling denominated in the
   *  wrong one passes a 117-character paragraph (#1145's ruling). `0` means the measurement did not
   *  happen — read as NO VERDICT. Optional: absent in sample sets from an older walker string. */
  readonly glyphAdvancePx?: number;
  /** This text sits inside the chat TRANSCRIPT (`[data-slot="message-bubble"]`), which takes the wider
   *  `--reading-measure` (75ch) by owner ruling and is therefore judged in CSS `ch` against its own token
   *  rather than against the 65-75 law-character band (#1145). Optional: absent reads as ordinary prose,
   *  i.e. the STRICTER arm — a missing fact never buys a wider ceiling. */
  readonly readingSurface?: boolean;
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
  /** The `data-voice` \@orb/ui `<Text>`/`<Heading>` stamped on this element (or the nearest carrier), empty
   *  when the call site set none. A VOICE IS AN AUTHORED CLAIM ABOUT INTENT — "what this text IS on the
   *  surface", the closed axis that replaced picking size×weight×tone×transform by taste — which is why
   *  the caveat rule (#652) anchors on it rather than trying to infer importance from pixels. Optional:
   *  absent in the fixture sample sets that predate it, where it reads as un-voiced. */
  readonly voice?: string;
  /** The `data-voice` stamped on THIS element only — never inherited from a carrier. `line-length` widens
   *  its prose population by voice (#1183) and an inherited voice would drag every nested `<span>` of a
   *  `voice="reading"` paragraph into the census as its own measurable line, each with a wrap-box width
   *  that is not a reading measure. Optional: absent in sample sets that predate it. */
  readonly ownVoice?: string;
  /** Inside `role="alert" | "alertdialog" | "status"` — the platform's own "this bounds what you are about
   *  to do". The second anchor the caveat rule accepts, so a warning written without a voice is still
   *  judged. Optional: absent in older fixture sample sets. */
  readonly alertContext?: boolean;
  /** Per-walk ids of this element's nearest four ancestors, outward. Two samples are IN THE SAME BLOCK
   *  when their paths intersect — the bound that keeps the caveat rule from comparing a caption against
   *  every larger glyph on the page, which is the false-positive machine it must not become. Optional:
   *  absent in older fixture sample sets, where the rule declines rather than comparing globally. */
  readonly blockPath?: readonly number[];
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
  /** The element IS a `@orb/ui` ListRow selection carrier (the primitive's own `list-row-root` /
   *  `list-row-body` slot) AND is currently selected — the owner-ratified selection idiom (2026-08-22,
   *  issue #485). BOTH halves are required: an unselected row, or any other rounded box wearing a left
   *  accent, keeps being judged. Derived in the walker (ops/walker/census-decor.ts), judged in
   *  lib/checks-decor.ts. */
  readonly listRowSelected: boolean;
  /** The element sits inside an ILLUSTRATED PICKER's art aperture — `@orb/ui`'s PickerCell
   *  `[data-slot="picker-cell-art"]` (packages/ui/src/primitives/picker-cell/picker-cell.tsx), the one
   *  anatomy every single-choice picture picker in this app wears. There the accent stripe is the SUBJECT
   *  of the picture, not a decoration on a card: the chat-style cell's mini transcript inherits the real
   *  skin's border declarations on purpose (`stripeOf`, appearance-chat-style-cards.tsx) so the reader can
   *  see what that skin looks like, and the density/elevation diagram cells do the same for their axes.
   *  Keyed on the SHARED slot, so ALL FOUR illustrated pickers ride one row: `<RadioGroupPickerItem art=…>`
   *  is the only door into the aperture and ast-grep finds exactly four (787 tsx, 2026-09-05) — chat style,
   *  density, elevation, and the theme LOOKS picker (`ThemeMiniSurface`), whose swatch is a picture of a design
   *  too. ANCESTOR-scoped (unlike `listRowSelected`); `closest()` matches SELF, harmless because the aperture's
   *  own recipe (`picker-cell/variants.ts` `art`) declares no border, so it never enters this census. */
  readonly artPane: boolean;
}

// ── Chromatic glow shadows + radial washes ──────────────────────────────────
// `GlowShadowInput` / `RadialGlowInput` MOVED to contract/backdrop.ts (2026-09-01) — same cycle-break
// as `Backdrop`: samples-hover.ts carries glow rows on its read results, and importing them from this
// aggregator closed a type-only `no-circular` loop. Re-exported here so existing consumers are unchanged.

// ── Ornament censuses (patterns · icon tiles · static motion) ────────────────────────────────────────
// `BgPatternInput` / `IconTileInput` / `MotionStaticInput` MOVED to contract/samples-ornament.ts (#1315) —
// the #797 split reason, one family over: this file was AT the 450-line cap and the boundary census needed
// room. Re-exported below beside the other family doors; the import is load-bearing because `RawSamples`
// composes these names (a bare `export … from` re-exports without binding them locally).
export type { BgPatternInput, IconTileInput, MotionStaticInput } from "./samples-ornament.ts";

// ── Page censuses: fonts + type-scale spread (impeccable adapted, ramp-bound) ──
/** One face the cascade names FIRST on some element, paired with whether this environment can PAINT it.
 *  The pair is required because the two facts fail in opposite directions: the name is a cascade fact a
 *  missing webfont cannot move, and `available` is the only thing that separates a token stack that
 *  renders from one whose brand face was never shipped. Measured by glyph metrics in
 *  ops/walker/census-text.ts — `document.fonts.check` is vacuously TRUE for an unregistered family and
 *  cannot answer it. */
export interface FontFaceInput {
  readonly name: string;
  readonly available: boolean;
}

export interface FontCensusInput {
  readonly faces: readonly FontFaceInput[];
  /** False when the in-page metric probe failed its own two-sided control (no 2d context, a present face
   *  it could not distinguish, or an impossible family reading as present). Then `available` carries no
   *  information and every token face is WITHHELD — absence of measurement is never a clean pass. */
  readonly probeUsable: boolean;
  readonly sizes: readonly number[];
}

// ── Text overflow (impeccable `text-overflow` — the walker measured the spill) ──
// THE POPULATION IS "TRUNCATED WITH NO AFFORDANCE" (#825), never `scrollWidth > clientWidth`. The raw
// form is the shape of every CORRECTLY truncating label in the app and minted a P1 against the topbar
// chat title (docs/reviews/side-eye/2026-08-30-this-chat-cls.md §6 retraction 6). The walker silences a
// spill whose nearest clipping ancestor-or-self computes `text-overflow: ellipsis`, or that carries the
// full string in a `title`/`aria-label` within four levels — so anything that reaches here is text the
// reader can neither see nor recover.
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

// ── Clipping container vs cut child (impeccable `clipped-overflow-container`) ──
// TWO ARMS (#444): `positioned` is the original — an absolute/fixed child that needs to escape a clip.
// `in-flow` is the #439 class — ordinary in-flow content pushed OUT of a clipping box (a `justify-end`
// nowrap row wider than its container puts its first control past the LEFT edge). Negative overflow is
// invisible to `scrollWidth`, so nothing in the fleet saw it until this arm existed.
export interface ClippedOverflowInput {
  readonly selector: string;
  readonly childSelector: string;
  readonly flow: "in-flow" | "positioned";
  /** The worst side the child's border box exits the container's PADDING box by — null only on the
   *  zero-size positioned fallback, where the declared insets are the evidence and nothing measures. */
  readonly side: "bottom" | "left" | "right" | "top" | null;
  readonly spillPx: number;
}

// ── Cards flush against a scroller edge (impeccable `edge-flush-cards`) ───────
export interface EdgeFlushInput {
  readonly scrollerSelector: string;
  readonly cardSelector: string;
  readonly edge: "left" | "right";
  readonly gapPx: number;
  readonly count: number;
}

// ── Truncated to NOTHING (#816 — the label present in the DOM and invisible) ──
// The sibling of `TextOverflowInput`, and deliberately its own family: text-overflow is "more content
// than box, and it SPILLS"; this is "the box collapsed to zero and the content is GONE". The walker's own
// `isVisible` requires `rect.width > 0`, so a name squeezed to 0px by a shrink-0 neighbour was not merely
// unjudged — it was invisible to EVERY family, which is how a review's P1 read as census 420 / 0 findings.
export interface TruncatedTextInput {
  /** Stable authored-decision identity. Absent in pre-#987 fixture bundles, which retain per-row identity. */
  readonly authoredTarget?: string;
  readonly authoredHome?: string;
  readonly selector: string;
  /** What the text would occupy unwrapped (`scrollWidth`) — the size of what the reader is missing. */
  readonly naturalPx: number;
  /** How much of that natural extent survives inside the nearest clipping ancestor's content box. */
  readonly visiblePx: number;
  /** The clipping box that cut it — a reader needs the container, not just the victim. */
  readonly clipSelector: string;
  /** The erased string, trimmed — the whole point is that nobody can read it on screen. */
  readonly text: string;
}

// ── A painted element whose own centre belongs to a NEIGHBOUR (#816, the mis-tap signature) ──
// Geometry alone cannot say this: deliberate stacking (a menu over a row, a scrim over the page) is
// intersecting rects BY DESIGN. The discriminator is the COMPOSITOR's disagreement at the loser's own
// centre, bounded to a LOCAL neighbour (a common ancestor within a few levels) so an overlay covering the
// page is never mistaken for a row colliding with itself.
export interface ObscuredTargetInput {
  /** Both sides of the collision's authored identity; selector fallback preserves historical fixtures. */
  readonly authoredTarget?: string;
  readonly authoredHome?: string;
  readonly hitAuthoredTarget?: string;
  readonly hitAuthoredHome?: string;
  readonly selector: string;
  /** What `elementFromPoint` returned at this element's centre instead. */
  readonly hitSelector: string;
  /** The intersection of the two border boxes on the worst axis, in px. */
  readonly overlapPx: number;
  /** Share of the loser's own box the winner covers, 0-1 — the size of the collision. */
  readonly coveredRatio: number;
  /** Does the loser offer an action itself (a control) or is it informative text (a badge/label)? */
  readonly interactive: boolean;
  readonly text: string;
}

// ── Aggregation ──────────────────────────────────────────────────────────────
export interface RawSamples extends RelationalSamples {
  /** The denominator contract for every sample family below. Missing evidence is an instrument gap. */
  readonly subjectAccounting: SubjectAccountingInput;
  /** Requested-vs-rendered theme provenance and effective polarity over those same walked subjects. */
  readonly themeRender: ThemeRenderInput;
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
  /** Form-control DECLARED boundaries and the paint outside them (border-contrast, WCAG 1.4.11).
   *  Optional: absent from the fixture sample sets that predate the census, where it reads as "no
   *  boundary censused" and the rule publishes no row rather than a fabricated clean one. */
  readonly borderContrasts?: readonly BorderContrastInput[];
  /** How much of the OFFERED control population the viewport-bound censuses actually reached (#653).
   *  Optional: absent from the fixture sample sets that predate it, where the runner prints the reach
   *  line as `unreported` rather than fabricating a complete-looking zero. */
  readonly censusReach?: CensusReachInput;
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
  /** Text collapsed to zero rendered width (#816). Optional: absent from the fixture sample sets that
   *  predate it, where it reads as "no erased text censused". */
  readonly truncatedTexts?: readonly TruncatedTextInput[];
  /** Painted elements whose own centre hit-tests to a local neighbour (#816). Optional for the same
   *  reason as above. */
  readonly obscuredTargets?: readonly ObscuredTargetInput[];
  /** The obscured census's denominator — absent means the sample set predates the family, which the
   *  report prints as `unreported` rather than as a complete-looking zero. */
  readonly obscuredScan?: ObscuredScanInput;
  /** Hover-painted texts measured in their FORCED `:hover` state, and that pass's own denominator
   *  (ops/hover.ts). Absent when the pass did not run — coarse pointer, a fixture set, a break — and
   *  absent means NO accounting row at all, never a clean-looking zero. Inline imports: this file sits
   *  ON the 450-line tooling cap with three lanes live in it, so these two fields cost no import line. */
  readonly hoverStates?: readonly import("./samples-hover.ts").HoverContrastInput[];
  readonly hoverScan?: import("./samples-hover.ts").HoverScanInput;
  readonly buriedRasters?: readonly import("./samples-media.ts").BuriedRasterInput[];
  /** Which capped censuses TRUNCATED, and by how much (#1038). REQUIRED, unlike the optional families
   *  above, and deliberately so: an absent-reads-as-nothing-dropped field would restore the exact
   *  silence the ledger exists to end, so a walker that omits it is an instrument error at the seam
   *  (ops/page-validate.ts) rather than a run that reads uncapped-clean. */
  readonly censusCaps: CensusCapAccountingInput;
}
