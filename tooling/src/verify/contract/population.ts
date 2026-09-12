// The gate population vocabulary: named roots are the only path-bearing declarations, while composite
// sets contain roots only so typos and set cycles are impossible at the type layer. The pure resolver is
// ../lib/population-resolver.ts; descriptors retain the expression itself for explain/report output.
export const POPULATION_ROOTS = {
  "@client": ["packages/client/src/"],
  "@ui": ["packages/ui/src/"],
  "@server": ["packages/server/src/"],
  "@db": ["packages/db/src/"],
  "@contracts": ["packages/contracts/src/"],
  "@kit": ["packages/kit/src/"],
  /** The example-plugin package. An independently selectable workspace member (`packages/*`), so §12.4
   *  admits it as a root — deliberately NOT a member of `@packages`, which is an explicit six-root list
   *  every existing policy was authored against and which must not widen silently. Added 2026-09-11 with
   *  the `caught-failure-ownership` conversion, whose legacy `scanRoot` covered `packages/<any>/src` and
   *  whose census records four live sites here; without the root the conversion would have narrowed the
   *  policy and dead-lettered those markers. */
  "@showcase": ["packages/showcase-plugins/src/"],
  "@tooling": ["tooling/src/"],
  "@tests": ["tests/"],
  "@scripts": ["scripts/"],
} as const satisfies Readonly<Record<`@${string}`, readonly string[]>>;

export type PopulationRoot = keyof typeof POPULATION_ROOTS;

/** One root's membership of `@authored`, with the reason an excluded root is excluded.
 *
 *  A `false` row MUST carry its `why`: an omission with no stated reason is indistinguishable from the
 *  omission this shape exists to make impossible. */
export type AuthoredMembership = { readonly authored: true } | { readonly authored: false; readonly why: string };

/** WHICH ROOTS `@authored` MEANS — the CLASSIFICATION, from which the set below is derived (#1980).
 *
 *  `@authored` was a hand-typed nine-root LITERAL and nothing held it two-sided, so when `@showcase` was
 *  added to `POPULATION_ROOTS` on 2026-09-11 it silently did not join, and `packages/showcase-plugins/src`
 *  fell outside every policy declaring `@authored` with no author ever deciding that. The set is now
 *  DERIVED from this map and the map is EXHAUSTIVE over `PopulationRoot`, so the enforcer is tsc itself
 *  (constitution §2.2 rung 2): a new root that is not classified here fails the `satisfies` below with a
 *  missing-property error naming the root. The decision cannot be skipped, only made and stated.
 *
 *  `populationResolver`'s own test asserts `POPULATION_ROOTS` and `POPULATION_SETS` by literal, which REDS
 *  when a root is added — but it reds on the ROOT list alone and asks the author nothing about `@authored`,
 *  which is exactly how the 2026-09-11 omission passed a green suite. A mirror is not a classification. */
const AUTHORED_MEMBERSHIP = {
  "@client": { authored: true },
  "@ui": { authored: true },
  "@server": { authored: true },
  "@db": { authored: true },
  "@contracts": { authored: true },
  "@kit": { authored: true },
  "@showcase": {
    authored: false,
    why:
      "an authored workspace package that is deliberately OUTSIDE `@authored` today, so the 23 policies declaring it do not " +
      "see `packages/showcase-plugins/src`. That is an OPEN QUESTION rather than a settled boundary: widening it is a " +
      "behaviour change across all 23, so it is measured and ruled, never done in passing. Measured 2026-09-11 " +
      "(`@showcase` added as a root, `pnpm check:structure` + `pnpm check:policy-conformance`): ZERO new findings and zero " +
      "proof-row failures — the blast radius is empty today because the package holds one file, which is why the decision " +
      "is cheap now and gets more expensive with every file added to it. A policy that needs the package TODAY declares " +
      "both refs (`['@authored', '@showcase']`), which is what the `harnessGlobs`-derived conversions do",
  },
  "@tooling": { authored: true },
  "@tests": { authored: true },
  "@scripts": { authored: true },
} as const satisfies Readonly<Record<PopulationRoot, AuthoredMembership>>;

/** The classified roots, in `POPULATION_ROOTS` declaration order — the same order the literal carried, so
 *  the derivation is byte-comparable with what it replaced. */
const AUTHORED_ROOTS: readonly PopulationRoot[] = (Object.keys(AUTHORED_MEMBERSHIP) as readonly PopulationRoot[]).filter(
  (root) => AUTHORED_MEMBERSHIP[root].authored,
);

/** Why a root is not in `@authored`, or `undefined` when it is — the reader for anything that has to
 *  EXPLAIN the boundary rather than merely apply it (a gate diagnostic, this contract's own test). */
export function authoredExclusionReason(root: PopulationRoot): string | undefined {
  const row = AUTHORED_MEMBERSHIP[root];
  return row.authored ? undefined : row.why;
}

export const POPULATION_SETS = {
  "@frontend": ["@client", "@ui"],
  "@backend": ["@server", "@db", "@contracts"],
  "@packages": ["@client", "@ui", "@server", "@db", "@contracts", "@kit"],
  /** "everything this repo authors" — DERIVED from `AUTHORED_MEMBERSHIP` above, never re-typed here. */
  "@authored": AUTHORED_ROOTS,
} as const satisfies Readonly<Record<`@${string}`, readonly PopulationRoot[]>>;

export type PopulationRef = PopulationRoot | keyof typeof POPULATION_SETS;
export type LoadableExt = "ts" | "tsx";
type NonEmptyTuple<T> = readonly [T, ...T[]];

export type PopulationExpr =
  | PopulationRef
  | NonEmptyTuple<PopulationRef>
  | {
      readonly in: NonEmptyTuple<PopulationRef>;
      readonly not?: NonEmptyTuple<PopulationRef>;
      readonly under?: NonEmptyTuple<string>;
      readonly notUnder?: NonEmptyTuple<string>;
      readonly named?: NonEmptyTuple<string>;
      readonly notNamed?: NonEmptyTuple<string>;
      readonly ext?: NonEmptyTuple<LoadableExt>;
      readonly notExt?: NonEmptyTuple<LoadableExt>;
      readonly depth?: "flat";
    }
  | { readonly of: "all"; readonly why: string; readonly notUnder?: NonEmptyTuple<string> }
  | { readonly of: "none"; readonly why: string };

export interface ResolvedPopulation {
  readonly paths: readonly string[];
  readonly admitted: number;
  readonly rejected: number;
  readonly candidates: number;
}
