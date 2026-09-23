// POPULATION SELECTION — the ONE calculation that turns a DECLARED population plus a REQUESTED path set into
// the population an owner actually runs over, and into the applicability verdict that follows from it (#2309).
//
// NOT `lib/policy-selection.ts`, which is the other selection: that module decides WHICH POLICIES a
// `--check`/`--family` selector admits (a roster question). This one decides, for one already-selected owner,
// WHICH PATHS a narrowed scope leaves it — a population question. Two doors read this one:
//   · `lib/policy-plan.ts`   the planner, whose answer becomes the `PolicyOwnerPlan` the dispatcher must agree
//     with (`applyOwnerPlan` THROWS on disagreement, so a second spelling here is a crash, not a drift);
//   · `lib/policy-pass.ts`   the production dispatcher, which is the live door today (`ops/scoped.ts` and
//     `ops/structure.ts` call `runPolicyPass` directly and supply no plan) and stays the live door until the
//     planner cutover.
// Before #2309 each door computed the split itself and they did not agree; the disagreements are recorded in
// the two rules below (the 2026-09-13 resource-selection repair).
//
// THE TWO RULES, and why they are not the same rule.
//
//  1. AN INPUT IS NEVER NARROWED. A resource (the committed ledger, a package manifest, a CSS inventory) and a
//     consumed fact's census are DATA the verdict reads, not subjects it judges. Intersecting them with the
//     requested set withdrew the data and left the owner judging with a hole: measured 2026-09-13 at `028e278ee`,
//     a changed-mode request naming ONE `@ui` seal took `baseui-derives-not-respells` and its `-health` sibling
//     to `[create] resource request json:baseui-manifest is undeclared` — a WITHHELD owner on the ordinary
//     `--changed` path — because `requestStaysDeclared` drops a request whose paths all fell outside the
//     narrowed resource population. So a RUNNING owner receives its complete declared resource population, and
//     the narrowing applies to its SOURCE population alone.
//
//  2. A CHANGED INPUT RESELECTS EVERY SUBJECT. A resource change can invalidate a seal the request never named:
//     the same measurement drove a request naming ONLY the ledger and got `mode: "run"`, `owner: success`, ZERO
//     effective source paths and ZERO findings from BOTH siblings while the whole-scope run over the identical
//     tree reported one finding each. A successful clean over an empty subject set is the #1979 class one layer
//     up, so when the request names any declared resource or dependency path the owner's FULL declared source
//     population is reselected.
//
// WHAT DELIBERATELY DID NOT CHANGE — the applicability arithmetic. `deferred` and `empty-intersection` are
// SCOPE verdicts ("does the request cover what I judge?"), and they are still computed on the raw intersection
// of the owner's OWN declaration, exactly as before. Widening them to the completed resource set would have
// made every `of: "none"` entire-population policy runnable on every changed run — `biome-grant-liveness`
// declares `tracked-files`, whose population is the whole corpus, so the deferral it relies on would never
// fire again. Availability and applicability are two questions; conflating them is what produced both defects.
//
// DEPENDENCY PATHS (a consumed fact's declared population) count in the TOUCH set and NOT in the completeness
// denominator, and that asymmetry is forced: `resolveFactRuns` resolves a fact over its FULL declared
// population and ignores `requestedPaths` entirely, so a consumer's fact data is always complete and can never
// be a reason to defer — while the planner counted fact paths in BOTH halves, which made it defer an
// entire-population consumer the dispatcher then ran to success, and `applyOwnerPlan` turns exactly that
// disagreement into a thrown tool error.
import type { PolicySelectionInput, PolicySelectionResolution } from "../contract/policy-effective-population.ts";

function intersect(paths: readonly string[], requested: ReadonlySet<string>): readonly string[] {
  return paths.filter((path) => requested.has(path));
}

/** Pure and TOTAL: every input shape resolves to a disposition, so this module raises no refusal and is not a
 *  `POLICY_REFUSAL_EMITTERS` member. Declaration validity (a resource policy with no resources, a source
 *  population that admitted nothing) is decided by the callers, one layer up, before they ask. */
export function resolveEffectivePopulation({
  execution,
  declaredSourcePaths,
  declaredResourcePaths,
  dependencyPaths,
  requested,
}: PolicySelectionInput): PolicySelectionResolution {
  if (requested === null) {
    return {
      population: {
        declaredSourcePaths,
        declaredResourcePaths,
        requestedPaths: null,
        effectiveSourcePaths: declaredSourcePaths,
        effectiveResourcePaths: declaredResourcePaths,
      },
      disposition: "run",
    };
  }
  const declared = { declaredSourcePaths, declaredResourcePaths, requestedPaths: requested.identity } as const;
  const current = requested.current;
  const selectedSource = intersect(declaredSourcePaths, current);
  const selectedResource = intersect(declaredResourcePaths, current);
  const owned = new Set([...declaredSourcePaths, ...declaredResourcePaths]);
  const selectedOwned = new Set([...selectedSource, ...selectedResource]);
  const touched = selectedOwned.size > 0 || dependencyPaths.some((path) => current.has(path));
  const narrowed = { effectiveSourcePaths: selectedSource, effectiveResourcePaths: selectedResource } as const;
  if (!touched) {
    return { population: { ...declared, ...narrowed }, disposition: "empty-intersection" };
  }
  if (execution === "entire-population" && selectedOwned.size < owned.size) {
    return { population: { ...declared, ...narrowed }, disposition: "deferred" };
  }
  const inputTouched = selectedResource.length > 0 || dependencyPaths.some((path) => current.has(path));
  return {
    population: {
      ...declared,
      effectiveSourcePaths: inputTouched ? declaredSourcePaths : selectedSource,
      effectiveResourcePaths: declaredResourcePaths,
    },
    disposition: "run",
  };
}
