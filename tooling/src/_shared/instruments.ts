// The instrument registry — the tools whose output is a VERDICT about the app, where a blind zero reads
// as a pass. Every member owes TWO proof classes in its tests/tooling/<tool>/ mirror, both gate-enforced
// (tooling-instrument-proof): `@instrument-proof:` — a planted DEFECT must RED — and
// `@instrument-absence-proof:` — a removed apparatus or an emptied population must NOT read clean (#409).
// The second is the harder one and the one that goes missing: an instrument can bite correctly on a plant
// and still report `0 findings, PASS` over a page it never censused. A member joins in the SAME commit its
// tool dir lands (snap landed P2; ui-audit/motion-audit/cpu-profile/render-trace/wire-tap join at P3)
// — a row naming a dir that does not exist is gate-RED (docs/law/Core-Tooling-Law.md §4.5).
/** @public — read structurally by the tooling-instrument-proof gate (an AST read, invisible to knip). */
export const INSTRUMENT_TOOLS = [
  "snap",
  "ui-audit",
  "motion-audit",
  "cpu-profile",
  "render-trace",
  "wire-tap",
  "mutation-probe",
  "mutation-arid",
  "review-mirror",
] as const;

/** @public — the member union. */
export type InstrumentTool = (typeof INSTRUMENT_TOOLS)[number];
