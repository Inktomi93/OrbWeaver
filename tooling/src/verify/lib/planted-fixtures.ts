// THE PLANTED-FIXTURE OBSERVER (#2069) — how a real-tree run tells that it is NOT QUIET.
//
// THE DEFECT. `tests/tooling/check-gates.repo.int.test.ts` materializes `__g_` fixtures INSIDE the real package
// tree (its gates anchor on realistic paths) and reaps them when its own child run finishes. A structure run
// overlapping that window therefore judges a tree that does not exist — and the artifact it produces looks
// EXACTLY like a real one. Measured 2026-09-12: slot `main-2930600` came back with inflated raw counts and
// nothing on the artifact said why.
//
// Stripping the probe FINDINGS (lib/pass.ts `stripProbeFindings`) is the other half of this rule and is not a
// substitute for it: stripping keeps the fixtures from REDDING an independent run, which is correct, but it
// also makes the overlap invisible — and the counts a fixture-planting window perturbs are not only the
// findings (scan denominators, populations, ratchet baselines and every fs-reading gate move too).
//
// SO THE RUN OBSERVES, AND SAYS SO. A run that sees a sentinel path it did not plant records it in
// `incompleteReasons`, which the existing #410 machinery already turns into "this report is NOT a verdict"
// plus an exit-2. The planter's OWN child runs are exempt — they set `ORB_GATE_FIXTURES=1` precisely because
// they must see what they planted.
//
// THE RESIDUAL WINDOW, stated rather than hidden: the caller samples at both ends of its walk, so a plant that
// opens before the fileset is taken and one that opens while the gates run are both caught. A plant that opens
// AND closes strictly between the two samples is not observable from the READER's side at all; closing it
// needs the PLANTER to announce itself, which is a separate change to a suite this module does not own.
import { globSync } from "node:fs";

/** The roots a fixture-planting suite writes into and reaps from — `cleanFixtures()`'s own argument list in
 *  tests/tooling/check-gates.repo.int.test.ts, so the observer's scope is the planter's scope by construction
 *  rather than by guess. */
const PLANTED_ROOTS = ["packages", "tests", "scripts", "tooling"] as const;
/** Both reserved sentinels (`__g_` gate fixtures, `__dc_` dep-cruiser fixtures), matching lib/pass.ts's
 *  `PROBE_ARTIFACT_RE`. The glob matches a planted DIRECTORY as well as a planted file — the planter creates
 *  both (`packages/server/src/domain/__g_struct/index.ts`). */
const PLANTED_GLOBS = PLANTED_ROOTS.map((dir) => `${dir}/**/__{g,dc}_*`);
/** How many observed paths the reason names before eliding: enough to identify WHICH suite was planting
 *  without turning a console line into a fixture listing. */
const NAMED_PLANTED_PATHS = 8;

function isNodeModules(path: string): boolean {
  return path === "node_modules" || path.endsWith("/node_modules");
}

/** Every sentinel path visible under the planting roots RIGHT NOW, sorted. Measured ~80ms on this tree against
 *  a ~5-minute whole-corpus run, and 0 matches on a quiet tree with `node_modules` present — a planted control
 *  (`packages/kit/src/__g_pgsd_probe.ts`) was found by the same invocation, so the zero is a measurement rather
 *  than a failure to look. */
export function plantedPaths(root: string): readonly string[] {
  return globSync(PLANTED_GLOBS, { cwd: root, exclude: isNodeModules })
    .map((path) => path.replaceAll("\\", "/"))
    .toSorted();
}

/** WHY this run cannot speak for the real tree, or null when it can (#2167). Two conditions, and the FIRST
 *  one is the defect a fresh-context verifier actually fell into:
 *
 *  1. FIXTURE MODE. `ORB_GATE_FIXTURES=1` is the gate self-test's opt-out from probe stripping — its child
 *     runs MUST see the `__g_` files it planted (contract/run-manifest.ts, ops/scoped.ts:260). Those runs are
 *     perfectly legitimate and perfectly complete, and their artifact is the SELF-TEST'S OWN OUTPUT: on
 *     2026-09-12 three of twelve published slots were that shape, indistinguishable from a real-tree verdict,
 *     and a verifier built a whole REAL-TREE LIVENESS section on one of them. The content was never corrupt —
 *     the LABEL was missing.
 *  2. CONTAMINATION. Planted paths observed by a run that did NOT plant them (#2069): the tree these counts
 *     describe stopped existing mid-walk.
 *
 *  The two are mutually exclusive by construction — `observed` is only ever populated outside fixture mode —
 *  so the order below is presentational, not a precedence rule. */
export function nonVerdictReason(fixtureMode: boolean, observed: readonly string[]): string | null {
  if (fixtureMode) {
    return (
      "FIXTURE MODE (ORB_GATE_FIXTURES=1): this artifact is the gate self-test's own output — it deliberately " +
      "reports on planted `__g_`/`__dc_` fixtures and is NOT a statement about the real tree"
    );
  }
  return notQuietReasons(observed)[0] ?? null;
}

/** The reason a not-quiet run carries into `incompleteReasons` — empty when the run was quiet, which is the
 *  honest zero and the only thing that lets the QUIET arm be asserted separately from the loud one. */
export function notQuietReasons(observed: readonly string[]): readonly string[] {
  if (observed.length === 0) {
    return [];
  }
  const named = observed.slice(0, NAMED_PLANTED_PATHS).join(", ");
  const elided = observed.length > NAMED_PLANTED_PATHS ? ", …" : "";
  return [
    `this run OBSERVED ${observed.length} PLANTED FIXTURE PATH(S) it did not plant — a fixture-planting suite was in flight, so the tree these counts describe does not exist: ${named}${elided}`,
  ];
}
