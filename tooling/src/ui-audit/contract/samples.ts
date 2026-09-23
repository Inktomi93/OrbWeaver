// The raw-sample shapes the in-page walker (ops/walker.ts) gathers and lib/checks-* judge — plain data
// mirroring getComputedStyle/getBoundingClientRect. RawSamples at the bottom is the walker's return object.
//
// THIS FILE IS THE COMPOSITION HUB FOR A FAMILY OF `samples-*.ts` SIBLINGS, and that is the shape to keep:
// a new sample family lands as a sibling re-exported from here, NEVER as another inline block. It sat at
// the 450-line `tooling-size` cap with zero headroom until #2487, where the cap had already been paid in
// the wrong currency — `documentFrame` lost its doc comment to fit. Core-Tooling-Law.md §4.3 owns that
// rule now; the typography family moved out to contract/samples-typography.ts to make the room.
import type { InactiveKind, Rgb } from "@orb/tooling/_shared/wcag";
// `Backdrop` MOVED to contract/backdrop.ts (see its header). Imported locally because the shapes below
// USE it, and re-exported below so its consumers keep one import.
import type { Backdrop, GlowShadowInput, RadialGlowInput } from "./backdrop.ts";
import type { DocumentFrameInput, ObscuredScanInput, SubjectAccountingInput, ThemeRenderInput } from "./samples-evidence.ts";
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
  UnreachableHintInput,
} from "./samples-interactive.ts";
import type { ImageDistortionInput } from "./samples-media.ts";
import type { BgPatternInput, IconTileInput, MotionStaticInput } from "./samples-ornament.ts";
import type { CensusCapAccountingInput, RelationalSamples } from "./samples-populations.ts";
import type { FontCensusInput, TextStyleInput } from "./samples-typography.ts";

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

// `ImageDistortionInput` MOVED to contract/samples-media.ts (2026-09-06, #1825) — same 450-line-cap split
// reason as `BuriedRasterInput`'s own home there; re-exported below so existing consumers are unchanged.
export type { ImageDistortionInput } from "./samples-media.ts";

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
  UnreachableHintInput,
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
  /** The element carries the ratified SELECTION RAIL (`@orb/ui`'s `SELECTION_RAIL`) AND is selected — the
   *  owner-ratified idiom (#485); both halves required. The carrier set and the ruling: lib/selection-rail-sel.ts.
   *  Renamed from `listRowSelected` (#1834): the config band gained the same rail in #1823, so the field
   *  now names the FRAGMENT it covers rather than the one primitive it used to be scoped to. */
  readonly selectionRail: boolean;
  /** The element sits inside an ILLUSTRATED PICKER's art aperture — `@orb/ui`'s PickerCell
   *  `[data-slot="picker-cell-art"]` (packages/ui/src/primitives/picker-cell/picker-cell.tsx), the one
   *  anatomy every single-choice picture picker in this app wears. There the accent stripe is the SUBJECT
   *  of the picture, not a decoration on a card: the chat-style cell's mini transcript inherits the real
   *  skin's border declarations on purpose (`stripeOf`, appearance-chat-style-cards.tsx) so the reader can
   *  see what that skin looks like, and the density/elevation diagram cells do the same for their axes.
   *  Keyed on the SHARED slot, so ALL FOUR illustrated pickers ride one row: `<RadioGroupPickerItem art=…>`
   *  is the only door into the aperture and ast-grep finds exactly four (787 tsx, 2026-09-05) — chat style,
   *  density, elevation, and the theme LOOKS picker (`ThemeMiniSurface`), whose swatch is a picture of a design
   *  too. ANCESTOR-scoped (unlike `selectionRail`); `closest()` matches SELF, harmless because the aperture's
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

// `FontFaceInput`/`FontCensusInput`/`TextStyleInput` MOVED to contract/samples-typography.ts (see its
// header) — re-exported here so consumers keep one import, and imported above because `RawSamples` USES
// two of them (a bare `export … from` re-exports a name without binding it locally).
export type { FontCensusInput, FontFaceInput, TextStyleInput } from "./samples-typography.ts";

// ── Text overflow (impeccable `text-overflow` — the walker measured the spill) ──
// THE POPULATION IS "TRUNCATED WITH NO AFFORDANCE" (#825), never `scrollWidth > clientWidth`. The raw
// form is the shape of every CORRECTLY truncating label in the app and minted a P1 against the topbar
// chat title (2026-08-30 §6 retraction 6). The walker silences a
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
  /** Visible Base UI tooltip triggers (#2452). Optional: absent from the fixture sample sets that
   *  predate the census, where it reads as "no tooltip trigger censused" and the rule publishes no row
   *  rather than a fabricated clean one. */
  readonly unreachableHints?: readonly UnreachableHintInput[];
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
  /** The page's own resting frame against the viewport the walk judged it at — REQUIRED for exactly
   *  `censusCaps`' reason above, since an absent-reads-as-fits field restores the silence the refusal
   *  exists to end. The full ruling (why the HEIGHT pair is carried and never judged, and why `worst` is
   *  a bounded list beside a complete `total`) is on `DocumentFrameInput` in contract/samples-evidence.ts.
   *  RESTORED at #2487: this comment was deleted to buy the one line the field cost when this file sat at
   *  the 450-line cap — see Core-Tooling-Law.md §4.3 for why that trade is now named and refused. */
  readonly documentFrame: DocumentFrameInput;
}
