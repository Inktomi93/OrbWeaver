// ui-audit sample shapes — complete rule-population census denominators (#984/#987). These stay separate from
// samples-layout.ts because RawSamples is already at the tooling-size boundary; the population evidence
// is a cross-rule contract consumed by collection/reporting, not another rendered-layout fact.
import type { CohortAnatomyInput, EmptyStateInput, PaneInkInput, QuietStateInput, RowVoidInput, SelectionIdiomInput } from "./samples-layout.ts";

/** Walker-side denominator before Node settles findings, collapses authored repeats, and applies representative caps. */
export interface RelationalCensusAccountingInput {
  readonly candidates: number;
  readonly judged: number;
  readonly withheld: Readonly<Record<string, number>>;
  readonly excluded: Readonly<Record<string, number>>;
}

interface RelationalPopulationAccountingInput {
  readonly "cohort-anatomy": RelationalCensusAccountingInput;
  readonly "double-empty-state"?: RelationalCensusAccountingInput;
  readonly "obscured-target"?: RelationalCensusAccountingInput;
  readonly "pane-ink": RelationalCensusAccountingInput;
  readonly "quiet-state"?: RelationalCensusAccountingInput;
  readonly "row-void": RelationalCensusAccountingInput;
  readonly "selection-idiom"?: RelationalCensusAccountingInput;
  readonly "truncated-to-nothing"?: RelationalCensusAccountingInput;
}

export interface RelationalSamples {
  readonly cohortAnatomies?: readonly CohortAnatomyInput[];
  readonly emptyStates?: readonly EmptyStateInput[];
  readonly paneInks?: readonly PaneInkInput[];
  readonly quietStates?: readonly QuietStateInput[];
  readonly relationalAccounting?: RelationalPopulationAccountingInput;
  readonly rowVoids?: readonly RowVoidInput[];
  readonly selectionIdioms?: readonly SelectionIdiomInput[];
}
