// ui-audit sample shapes — complete relational census denominators (#984). These stay separate from
// samples-layout.ts because RawSamples is already at the tooling-size boundary; the population evidence
// is a cross-rule contract consumed by collection/reporting, not another rendered-layout fact.
import type { CohortAnatomyInput, EmptyStateInput, PaneInkInput, QuietStateInput, RowVoidInput, SelectionIdiomInput } from "./samples-layout.ts";

/** Walker-side denominator before Node applies a representative cap to affected findings. */
export interface RelationalCensusAccountingInput {
  readonly candidates: number;
  readonly judged: number;
  readonly withheld: Readonly<Record<string, number>>;
}

export interface RelationalPopulationAccountingInput {
  readonly "cohort-anatomy": RelationalCensusAccountingInput;
  readonly "pane-ink": RelationalCensusAccountingInput;
  readonly "row-void": RelationalCensusAccountingInput;
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
