// Dead/empty CSS evidence. Findings preserve their historical arrays while the census denominators make a
// zero auditable: the browser must say what it walked and which sheets it could not read.

interface UnreadableCssSheet {
  readonly href: string | null;
  readonly error: string;
}

export interface DeadCssEvidence {
  readonly sheets: number;
  readonly readableSheets: number;
  readonly rules: number;
  readonly defined: number;
  readonly used: number;
  readonly unreadable: readonly UnreadableCssSheet[];
  /** Null only outside the app bridge (for example a local --file fixture). */
  readonly drain: { readonly requestedGeneration: number; readonly completedGeneration: number } | null;
  readonly dead: readonly { readonly token: string; readonly count: number }[];
  readonly empty: readonly string[];
}
