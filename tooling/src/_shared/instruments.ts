// The instrument registry — the tools whose output is a VERDICT about the app, where a blind zero reads
// as a pass. Every member owes ≥1 planted-defect proof test carrying the `@instrument-proof:` marker in
// its tests/tooling/<tool>/ mirror (gate: tooling-instrument-proof). A member joins in the SAME commit its
// tool dir lands (snap landed P2; ui-audit/motion-audit/cpu-profile/render-trace/wire-tap join at P3)
// — a row naming a dir that does not exist is gate-RED (docs/design/tooling-package.md §4.5).
/** @public — read structurally by the tooling-instrument-proof gate (an AST read, invisible to knip). */
export const INSTRUMENT_TOOLS = ["snap", "ui-audit", "motion-audit", "cpu-profile", "render-trace", "wire-tap"] as const;

/** @public — the member union. */
export type InstrumentTool = (typeof INSTRUMENT_TOOLS)[number];
