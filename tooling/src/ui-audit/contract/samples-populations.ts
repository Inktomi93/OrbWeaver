// ui-audit sample shapes — complete rule-population census denominators (#984/#987). These stay separate from
// samples-layout.ts because RawSamples is already at the tooling-size boundary; the population evidence
// is a cross-rule contract consumed by collection/reporting, not another rendered-layout fact.
import type { RelationalCensusAccountingInput } from "./findings.ts";
import type { OffGridTextInput, OffGridTransformInput, PromotedLayerOffsetInput } from "./samples-grid.ts";
import type { CohortAnatomyInput, EmptyStateInput, PaneInkInput, QuietStateInput, RowVoidInput, SelectionIdiomInput } from "./samples-layout.ts";
import type { HeadlineOverhangInput, InlinePaddingLeakInput } from "./samples-occlusion.ts";

// `RelationalCensusAccountingInput` MOVED to contract/findings.ts (see its header for why). Re-exported
// here so the ~34 consumers that reach for it alongside these population maps keep one import, and
// imported locally above because this file also USES it — a bare `export … from` would not bind it.
export type { RelationalCensusAccountingInput } from "./findings.ts";

interface RelationalPopulationAccountingInput {
  readonly "cohort-anatomy": RelationalCensusAccountingInput;
  readonly "double-empty-state"?: RelationalCensusAccountingInput;
  readonly "headline-overhang"?: RelationalCensusAccountingInput;
  readonly "inline-padding-leak"?: RelationalCensusAccountingInput;
  readonly "obscured-target"?: RelationalCensusAccountingInput;
  readonly "off-grid-text"?: RelationalCensusAccountingInput;
  readonly "off-grid-transform"?: RelationalCensusAccountingInput;
  readonly "pane-ink": RelationalCensusAccountingInput;
  readonly "promoted-layer-offset"?: RelationalCensusAccountingInput;
  readonly "quiet-state"?: RelationalCensusAccountingInput;
  readonly "row-void": RelationalCensusAccountingInput;
  readonly "selection-idiom"?: RelationalCensusAccountingInput;
  readonly "tier-drift"?: RelationalCensusAccountingInput;
  readonly "truncated-to-nothing"?: RelationalCensusAccountingInput;
}

/** One (element, property) comparison against `packages/ui/src/styles/tiers.css`'s density tier map —
 *  the SANCTIONED custom-property value paired with the PAINTED computed-style value the walker actually
 *  read (ops/walker/census-tier.ts). `sanctionedValue`/`paintedValue` are already unit-normalized (rem
 *  resolved to the live root font-size; a `line-height` pair converted to the same unitless ratio scale
 *  the leading tokens author in) so the epsilon decision in lib/checks-quality.ts never has to reason
 *  about units, only drift. */
export interface TierDriftInput {
  readonly selector: string;
  /** The nearest ancestor-or-self `[data-surface-tier]` value — whatever string is authored there, not
   *  a closed enum, so a future tier needs no change here. */
  readonly tier: string;
  readonly slot: string;
  readonly property: string;
  readonly varName: string;
  readonly unit: "num" | "px" | "ratio";
  readonly sanctionedRaw: string;
  readonly paintedRaw: string;
  readonly sanctionedValue: number;
  readonly paintedValue: number;
}

export interface RelationalSamples {
  readonly cohortAnatomies?: readonly CohortAnatomyInput[];
  readonly emptyStates?: readonly EmptyStateInput[];
  /** Text landings inside promotion contexts (ops/walker/census-grid.ts, Law 4). Optional: absent from the
   *  fixture sample sets that predate the family, where it reads as "no grid landing censused". */
  readonly offGridTexts?: readonly OffGridTextInput[];
  /** Non-identity rest transforms and their landings (Law 2's resolved arm). Optional for the same reason. */
  readonly offGridTransforms?: readonly OffGridTransformInput[];
  /** Display headlines whose edge clips into an opaque card (#816 arm ii). Optional: absent from the
   *  fixture sample sets that predate the family, where it reads as "no overhang censused". */
  readonly headlineOverhangs?: readonly HeadlineOverhangInput[];
  /** `inline` elements whose opaque fill runs off its line box (#816 arm iii). Optional for the same
   *  reason as above. */
  readonly inlinePaddingLeaks?: readonly InlinePaddingLeakInput[];
  readonly paneInks?: readonly PaneInkInput[];
  /** Promotion ROOTS and their own landings (Law 3 — the cause half of an off-grid text finding). Optional
   *  for the same reason. */
  readonly promotedLayerOffsets?: readonly PromotedLayerOffsetInput[];
  readonly quietStates?: readonly QuietStateInput[];
  readonly relationalAccounting?: RelationalPopulationAccountingInput;
  readonly rowVoids?: readonly RowVoidInput[];
  readonly selectionIdioms?: readonly SelectionIdiomInput[];
  /** Density-tier resolution comparisons (ops/walker/census-tier.ts). Optional: absent from the fixture
   *  sample sets that predate the family, where it reads as "no tier resolution censused". */
  readonly tierDrifts?: readonly TierDriftInput[];
}
