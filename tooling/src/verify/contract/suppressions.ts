// The governed SCOPE axis of the suppressions ledger (issue #962) — the partition the two ratification
// tables key on (`RATIFIED_RULES` for source, `RATIFIED_TEST_RULES` for tests). Homed in contract/ because
// it is an exported shape (the gate, its generator and its pins all read it) and the house `no-inline-types`
// gate refuses an exported type alias inside a gate module. Derived from the SAME predicate that admits a
// file (`governedScope` in gates/suppressions.ts), never from a second list.

/** ONE tuple, so a third scope is a row here and `tsc` finds every reader (Spine-TypeScript-and-Patterns.md §7.5).
 *  @public knip type-face false positive — the one-home vocabulary tuple behind the exported `GovernedScope` union — the
 *  ONE importable spelling of this axis, which nothing outside this module enumerates YET; un-exporting it would invite the
 *  re-spell `no-inline-union-redecl` exists to stop. */
export const GOVERNED_SCOPES = ["source", "tests"] as const;
export type GovernedScope = (typeof GOVERNED_SCOPES)[number];
