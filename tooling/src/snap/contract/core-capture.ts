// The population receipts of `evidence/core-capture.json`: one declaration for the writer (`ops/manifest.ts`)
// and the reader (`lib/run-finding-browser.ts`), so neither can assert a receipt the other refuses.

/** The retention basis each population names. */
export const CORE_CAPTURE_BASIS = {
  pageErrors: "all-observed",
  failedRequests: "latest-per-url",
  captures: "all-pages",
} as const;

export interface CoreCapturePopulations {
  /** `dropped` and `complete` are read off the page-error ring's retention receipt, never asserted: complete
   *  with nothing dropped, evicted (incomplete, `dropped` > 0), or unmeasured (incomplete, no receipt,
   *  `dropped` 0). */
  readonly pageErrors: { readonly records: number; readonly dropped: number; readonly complete: boolean; readonly basis: typeof CORE_CAPTURE_BASIS.pageErrors };
  readonly failedRequests: {
    readonly records: number;
    readonly dropped: null;
    readonly complete: false;
    readonly basis: typeof CORE_CAPTURE_BASIS.failedRequests;
  };
  /** Captures are the plain `CaptureOutcome[]` the run built, with no ring and no eviction path, so 0/true is a fact. */
  readonly captures: { readonly records: number; readonly dropped: 0; readonly complete: true; readonly basis: typeof CORE_CAPTURE_BASIS.captures };
}
