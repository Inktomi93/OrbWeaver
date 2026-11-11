// Per-format extraction contracts stay separate from dispatch to keep loader dependencies acyclic.

/** A loader's raw output — pre-normalization text plus optional per-format meta. */
export interface RawExtraction {
  readonly text: string;
  /** pdf only — the page count from the document. */
  readonly pageCount?: number;
  /** html `<title>` / pdf info-dict title, when present. */
  readonly title?: string;
}

/** An archive loader refused a file whose zip headers declare more output than its size budget allows. The dispatch
 *  answers it as the contracts' too-large refusal; every other loader throw is a damaged file. */
export class ExpansionBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpansionBudgetError";
  }
}

/** Per-format byte loading leaves normalization and failure classification to the dispatch. */
export type Loader = (bytes: Uint8Array) => Promise<RawExtraction>;
