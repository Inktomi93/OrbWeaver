// ONE PARSED `@orb-gate-ignore` MARKER — all that survives of `contract/pass.ts` after #2176 Phase F
// retired the legacy single-pass runtime that honoured the grammar (2026-09-14).
//
// The SUPPRESSOR is gone: no runtime reads a marker any more, because a final policy has no inline door
// (authority + the central `@orb-waive` engine own every escape, gate-runtime-standardization.md §12.5).
// What remains is the AUDIT: `lib/gate-ignore.ts` still recognises the grammar, `lib/gate-ignore-fact.ts`
// publishes the sites as a fact, and the `gate-ignore-inventory` policy reds every residual marker so the
// retired vocabulary cannot sit in the tree LOOKING like protection. This shape is that fact's payload.
export interface GateIgnoreMarker {
  readonly gate: string;
  /** §4.3a: the guarded POSITION (a finding's `token`), when the marker names one. `undefined` = the
   *  marker covered every finding of its gate on the guarded node. */
  readonly position: string | undefined;
  readonly reason: string;
  /** GATE-AUTHORING §4.3: a marker missing its `: <reason>` (or carrying an empty `()` position)
   *  suppressed NOTHING even while the suppressor existed — a bare-marker-exempts rule is a rubber stamp
   *  — and is reported by `gate-ignore-inventory` for exactly that reason. */
  readonly malformed: boolean;
}
