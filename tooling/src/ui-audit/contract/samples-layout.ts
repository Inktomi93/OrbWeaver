// ui-audit sample shapes — the RELATIONAL family (#978). Split from samples.ts for the tooling-size
// cap, the same way samples-interactive.ts carries the interactive family.
//
// WHY THIS FAMILY EXISTS. Every other sample here describes ONE element so a check can judge it against
// a threshold. The defects a human reviewer actually reports are relational: "nine config-group rows are
// 16px while the sibling collection rows in the same list are 32px", "one concept, two anatomies —
// shipped themes are 829x66 cards, your themes are 60x20 chips", "one surface, four row anatomies". None
// of those is a statement about a number; each is a statement about a POPULATION disagreeing with
// itself, and no per-element threshold can express one.

/** One population of siblings that share the author's own kind-claim (tag + `data-slot` + explicit role)
 *  under one parent, plus the spread of their rendered heights.
 *
 *  The cohort key is the author's CLAIM, never a guess: `data-slot` is this repo's component-identity
 *  attribute, so a cohort is "the things built from one component" — exactly the population that should
 *  agree. Keying on shape or class similarity would invent a claim nobody made and flag every
 *  deliberately-varied list. */
export interface CohortAnatomyInput {
  /** The parent that owns the cohort. */
  readonly selector: string;
  /** `tag|data-slot|role` — the kind-claim these members share. */
  readonly cohortKey: string;
  readonly members: number;
  readonly minHeightPx: number;
  readonly maxHeightPx: number;
  /** The most common height — the cohort's INTENDED anatomy; members off it are the outliers. A bare
   *  min/max cannot say which side is the defect, and an operator needs to know which rows to fix. */
  readonly modeHeightPx: number;
  readonly modeCount: number;
  readonly outlierCount: number;
  readonly outlierHeightPx: number;
  readonly outlierSelector: string;
  readonly distinctHeights: number;
  /** A member was mid-transition when the boxes were read — a moment, not a design. The check DECLINES
   *  rather than judging it (the same fence `ControlAspectInput.animating` declares). */
  readonly animating: boolean;
}

/** One row-shaped container and the widest gap between two horizontally-adjacent children that share a
 *  line, where the left flank carries text and the right flank holds a control.
 *
 *  THE BINDING IS THE FENCE, NOT THE GAP. A wide gap is a defect only when the flanks are BOUND — a
 *  label and the control it names. A topbar with a title left and actions right is chrome and is
 *  supposed to span its width, so it is never sampled. */
export interface RowVoidInput {
  readonly selector: string;
  readonly gapPx: number;
  readonly rowWidthPx: number;
  /** `gapPx / rowWidthPx`, rounded to 2dp — the share of the row that is nothing. */
  readonly gapRatio: number;
  readonly leftSelector: string;
  /** The label's own text, so the finding names WHICH row rather than a selector path. */
  readonly leftText: string;
  readonly leftWidthPx: number;
  readonly rightSelector: string;
  readonly rightWidthPx: number;
}

/** Every element on the surface currently expressing ONE selection state, and how many distinct visual
 *  vocabularies express it.
 *
 *  THE GROUPING KEY IS THE PRIMITIVE'S OWN CLAIM. This app is built exclusively on Base UI, whose 1.7
 *  docs define a closed state vocabulary — `data-checked` / `data-selected` / `data-current` /
 *  `data-pressed` / `data-active`, mirrored by the ARIA equivalents the app also authors. So "everything
 *  currently selected" is exhaustive rather than heuristic, and it spans CONTAINERS, which is exactly
 *  what a sibling cohort cannot see: a list row and a picker card are never siblings, and "eight ways to
 *  say this one" is a statement about the whole surface. */
export interface SelectionIdiomInput {
  /** Every authored state kind that contributed a selected/unselected delta. */
  readonly stateKinds: string;
  /** How many elements carry this state. */
  readonly elements: number;
  /** How many DISTINCT visual vocabularies express it. */
  readonly treatments: number;
  /** Each vocabulary and its population, e.g. `ring+fillx4 · bar-leftx3 · underlinex1`. The idiom is the
   *  MECHANISM, not the colour: two regions using one accent through different channels are still two
   *  vocabularies. */
  readonly signatures: string;
  /** The rarest treatment's element — the likeliest odd one out, and where a reader should look first. */
  readonly exampleSelector: string;
}

/** One region and how far down its own height its last text actually reaches.
 *
 *  Measured on TEXT-BEARING LEAVES, never the tallest descendant: a full-height flex container spans the
 *  pane, so a max-descendant measure reports 100% ink on an evacuated region. */
export interface PaneInkInput {
  readonly selector: string;
  readonly paneHeightPx: number;
  readonly lastInkPx: number;
  /** `lastInkPx / paneHeightPx`, 2dp. */
  readonly inkRatio: number;
  readonly textLeaves: number;
  /** Visible authored paint subjects (text runs, media, controls, or an element's own paint). */
  readonly designedSubjects: number;
}

/** The loudest ON state and the loudest OFF state on one surface, as an ORDERING.
 *
 *  No single contrast value here is wrong — the RANK is. Base UI emits `data-checked` and
 *  `data-unchecked` on the same component, so the pair is the author's own claim. Both sides must be
 *  measurable or the sample is not emitted; the population census withholds a one-sided cohort and the
 *  runner refuses a verdict rather than presenting the absent comparison as silence. */
export interface QuietStateInput {
  readonly selector: string;
  readonly offContrast: number;
  readonly onContrast: number;
}

/** How many empty states one surface renders at once, and how many of them offer no way out.
 *
 *  Structural rather than semantic: the app has exactly ONE empty-state primitive, so the count of
 *  simultaneously-rendered `empty-state-root` elements IS the shape, and `empty-state-action` says
 *  whether each offers a door. */
export interface EmptyStateInput {
  readonly selector: string;
  readonly rendered: number;
  readonly actionless: number;
}
