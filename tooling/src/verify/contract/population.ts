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

export const POPULATION_SETS = {
  "@frontend": ["@client", "@ui"],
  "@backend": ["@server", "@db", "@contracts"],
  "@packages": ["@client", "@ui", "@server", "@db", "@contracts", "@kit"],
  "@authored": ["@client", "@ui", "@server", "@db", "@contracts", "@kit", "@tooling", "@tests", "@scripts"],
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
