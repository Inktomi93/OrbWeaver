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
