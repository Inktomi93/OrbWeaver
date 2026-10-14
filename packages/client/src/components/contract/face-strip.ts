// Client-only measured geometry; no server or guest wire carries these values.
export interface FaceFoldInput {
  /** Measured width of every candidate face, in render order. */
  readonly widths: readonly number[];
  /** Measured width of the overflow tile — the reserve the fold spends when it folds. */
  readonly triggerWidth: number;
  /** The row's resolved column gap. */
  readonly gap: number;
  /** The row's available inline size. */
  readonly available: number;
}
