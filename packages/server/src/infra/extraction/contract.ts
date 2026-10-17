// Per-format extraction contracts stay separate from dispatch to keep loader dependencies acyclic.

/** A loader's raw output — pre-normalization text plus optional per-format meta. */
export interface RawExtraction {
  readonly text: string;
  /** pdf only — the page count from the document. */
  readonly pageCount?: number;
  /** html `<title>` / pdf info-dict title, when present. */
  readonly title?: string;
}

/** Per-format byte loading leaves normalization and failure classification to the dispatch. */
export type Loader = (bytes: Uint8Array) => Promise<RawExtraction>;
