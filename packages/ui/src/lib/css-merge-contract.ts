// Type-only configured class-merge trace contract. Kept free of DOM/React/runtime imports so Node tooling
// can validate the dev bridge without dragging @orb/ui's browser graph into its type program.

export interface CssClassOccurrence {
  readonly index: number;
  readonly className: string;
}

export interface CssMergeConflict {
  readonly axis: string;
  readonly loser: CssClassOccurrence;
  readonly winner: CssClassOccurrence;
}

/** What the configured merger DID to one loser→winner pair, as the merge seam classifies it.
 *  `conflict` is an ordinary same-axis override (the later class wins — the whole point of the merge).
 *  `cross-group` is the #2450 defect shape: the two classes belong to DIFFERENT Tailwind class groups,
 *  so one evicting the other is the merger MIS-CLASSIFYING a utility — never a legitimate override, and
 *  therefore an INSTRUMENT ERROR rather than a receipt. */
export type CssMergeClassification = { readonly kind: "conflict"; readonly axis: string } | { readonly kind: "cross-group"; readonly detail: string };

export interface CssMergeReceipt {
  readonly input: readonly CssClassOccurrence[];
  readonly conflicts: readonly CssMergeConflict[];
  readonly output: string;
}

export interface CssMergeTraceState {
  readonly enabled: boolean;
  readonly calls: number;
  readonly conflictCalls: number;
  readonly deduplicatedConflictCalls: number;
  readonly receipts: readonly CssMergeReceipt[];
}

/** Type-only tuple: tooling mirrors this exact shape for its runtime schema without importing UI code. */
export type CssMergeTraceStatuses = readonly ["ok", "instrument-error"];
export type CssMergeTraceStatus = CssMergeTraceStatuses[number];

export type CssMergeTraceSnapshot =
  | (CssMergeTraceState & { readonly status: CssMergeTraceStatuses[0] })
  | (CssMergeTraceState & { readonly status: CssMergeTraceStatuses[1]; readonly error: string });
