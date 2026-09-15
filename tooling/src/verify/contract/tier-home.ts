// The TIER IMPLEMENTATION HOME row — the scan-SCOPE vocabulary the `raw-spacing-tier` and
// `raw-typography-tier` families read, homed here rather than borrowed from `contract/gate.ts`'s
// exemption vocabulary (#2176 Phase F, #2320).
//
// WHY IT IS ITS OWN SHAPE AND NOT AN `ExemptionRow` — the `contract/tenancy-scope.ts#ScopingRow`
// precedent, restated for this axis. An exemption row is a row a gate FORGIVES an existing finding for,
// and `policy-legacy-imports` ARM D is right to red a final policy that receives one ("a gate module
// receives neither grant tables nor marker parsers"). A tier-implementation home is a different claim: it
// names the ONE directory that IMPLEMENTS a token scale and therefore must spell the raw utility once, so
// that no feature ever does. `gate-modernization` ARM B draws exactly this line in its own `fix` text —
// *"if the collection is a scan-SCOPE decision rather than an exemption, rename it out of the exemption
// vocabulary."*
//
// AND IT IS A MEASUREMENT, NOT A CLASSIFICATION ARGUMENT. Probed 2026-09-14 (`cp f f.bak`, both tables
// emptied, all four consumers re-run through `pnpm check:structure --check`, restored, `git status
// --short` empty): `no-raw-spacing-in-features`, `no-raw-typography-in-features`,
// `spacing-tier-home-health` and `typography-tier-home-health` all stay at ZERO findings with every row
// gone. The rows forgive NOTHING on today's tree, so they cannot become reviewed grants — a reviewed
// grant must be consumed exactly once and a zero-consumption row is an immediate `stale-reviewed-grant`
// alarm. They are pre-existing-by-construction scope rows, and `lib/sanctioned-home.ts`'s own header
// records the ruling that makes that legitimate: mode A ("the home still exists but no longer carries the
// shape") is DELIBERATELY not swept, because "a home legitimately holds zero instances between edits, and
// reding that would make the sanctioned path the unbuildable one."
//
// The liveness that DOES bind is by PATH: `unresolvedSanctionedHomeKeys` reds any key resolving to no
// file, so a row cannot outlive the directory it names.

/** ONE tier-implementation home. The KEY (in {@link TierImplementationHomes}) is the home; this carries
 *  the reason it may spell the raw utility AND the condition that ends the row. Deliberately NOT exported:
 *  the table alias below is the importable shape, and a second exported name nothing imports is what knip
 *  reds. A consumer needing the row type indexes the alias (`TierImplementationHomes[string]`). */
interface TierImplementationHome {
  /** Why this home implements the scale by hand, and what would end the row. Never empty. */
  readonly why: string;
}

/** A keyed tier-implementation table. A DIRECTORY key carries a trailing slash
 *  (`packages/ui/src/layout/`); a FILE key is exact — otherwise `packages/kit/src/timeline.ts` would
 *  inherit `packages/kit/src/time`'s row. */
export type TierImplementationHomes = Readonly<Record<string, TierImplementationHome>>;
