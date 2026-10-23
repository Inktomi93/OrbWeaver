export const IMPORT_OUTCOMES = ["added", "already"] as const;
// The import outcome.
// Second comment line.
export type ImportOutcome = (typeof IMPORT_OUTCOMES)[number];
