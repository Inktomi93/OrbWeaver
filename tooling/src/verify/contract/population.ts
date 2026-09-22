// The gate population vocabulary: named roots are the only path-bearing declarations, while composite
// sets contain roots only so typos and set cycles are impossible at the type layer. The pure resolver is
// ../lib/population-resolver.ts; descriptors retain the expression itself for explain/report output.
//
// THE ROOT LIST'S ENFORCER IS `tests/tooling/verify/contract/population.test.ts` (#2267). This table is
// hand-typed and tsc cannot read `pnpm-workspace.yaml`, so the workspace comparison sits at rung 4: that
// test reconciles these roots BOTH WAYS against pnpm's own workspace enumeration
// (`readPolicyWorkspacePackages`), so a new `packages/foo` that joins no root — and is therefore judged by
// no policy — reds, and so does a root naming a package that does not exist. The two deliberate
// asymmetries (`@tests`/`@scripts` are authored trees with no package; the workspace root has no `src/`)
// live there as data with a `why`, two-sided against staleness. `AUTHORED_MEMBERSHIP` and
// `PRODUCT_MEMBERSHIP` below are the separate, tsc-enforced half — which roots `@authored` and `@product`
// MEAN (#1980, #2488).
//
// A SHARED GLOB STRING DOES NOT ESTABLISH SHARED SEMANTICS (`docs/history/type-worlds-program-2026-09-10.md`
// line 84), and `@packages` is this repo's instance of that law. It is an explicit SIX-root list — an honest
// recording of "the roots the policies declaring it were authored against" — but most of its declarers mean
// "the authored code the product is built from", and those two answers diverged the day `@inference` became
// its own root (`146f71cd5`). Sixteen policies declared the string; the set never widened and announced
// nothing, which is line 126's "a smaller unannounced population is not a speed improvement". `@product`
// below is the second meaning given its own name and its own classification, so a policy SAYS which one it
// means. `@packages` keeps its recorded six-root meaning and is NOT a compatibility alias for `@product`
// (line 82 forbids retaining an alias for familiarity): its remaining declarers are the ones whose subject
// is reachable only from a root that can import `@orb/db`, and each states that in its own header.
export const POPULATION_ROOTS = {
  "@client": ["packages/client/src/"],
  "@ui": ["packages/ui/src/"],
  "@server": ["packages/server/src/"],
  "@db": ["packages/db/src/"],
  "@contracts": ["packages/contracts/src/"],
  "@kit": ["packages/kit/src/"],
  /** The example-plugin package. An independently selectable shipped workspace member (`packages/*`), so
   *  §12.4 admits it as a root. It is not a member of the fixed six-root `@packages` snapshot, but belongs
   *  to both generic `@authored` and `@product` composites below. Added 2026-09-11 with
   *  the `caught-failure-ownership` conversion, whose legacy `scanRoot` covered `packages/<any>/src` and
   *  whose census records four live sites here; without the root the conversion would have narrowed the
   *  policy and dead-lettered those markers. */
  "@showcase": ["packages/showcase-plugins/src/"],
  /** The default-content package (D160's second family — the seeded avatars + demo-chat transcripts and
   *  their reader). Same standing as `@showcase`: an independently selectable shipped workspace member
   *  admitted to `@authored` and `@product`, while the fixed `@packages` snapshot remains unchanged. Added
   *  2026-09-18 with the package itself, because its reader carries two `optional-read-as-absent` waivers
   *  that the `caught-failure-ownership` policy must be able to BIND — an unbindable waiver is a stale-waiver
   *  alarm and an ungoverned package, which is the narrowing the `@showcase` row exists to have prevented. */
  "@default-content": ["packages/default-content/src/"],
  /** The provider runtime — `infra/providers` extracted BELOW `server` (the inference program, §3.1). Its own
   *  root for the same §12.4 reason as the two above; unlike them it is CODE the `@server`-scoped policies
   *  already judged before the move, so it is classified `authored: true` below — leaving it outside
   *  `@authored` would silently NARROW every policy declaring it over live runtime code, the opposite of the
   *  measured-widening question the content packages pose. The `@server`-scoped gates that must ALSO see it
   *  (the `no-raw-egress` ratchet first) are re-pointed in the extraction step (§12), not here. */
  "@inference": ["packages/inference/src/"],
  "@tooling": ["tooling/src/"],
  "@tests": ["tests/"],
  "@scripts": ["scripts/"],
} as const satisfies Readonly<Record<`@${string}`, readonly string[]>>;

export type PopulationRoot = keyof typeof POPULATION_ROOTS;

/** One root's membership of `@authored`, with the reason an excluded root is excluded.
 *
 *  A `false` row MUST carry its `why`: an omission with no stated reason is indistinguishable from the
 *  omission this shape exists to make impossible.
 *  @public knip type-face false positive — the `Readonly<Record<PopulationRoot, AuthoredMembership>>` contract of the classification table below —
 *  what makes a missing `why` a compile error — never named at a call site. */
export type AuthoredMembership = { readonly authored: true } | { readonly authored: false; readonly why: string };

/** WHICH ROOTS `@authored` MEANS — the CLASSIFICATION, from which the set below is derived (#1980).
 *
 *  `@authored` was a hand-typed nine-root LITERAL and nothing held it two-sided, so when `@showcase` was
 *  added to `POPULATION_ROOTS` on 2026-09-11 it silently did not join, and `packages/showcase-plugins/src`
 *  fell outside every policy declaring `@authored` with no author ever deciding that. The set is now
 *  DERIVED from this map and the map is EXHAUSTIVE over `PopulationRoot`, so the enforcer is tsc itself
 *  (constitution §2.2 rung 2): a new root that is not classified here fails the exhaustive annotation
 *  below with a missing-property error naming the root. The decision cannot be skipped, only made and stated.
 *
 *  OWNER DECISION 2026-09-21: shipped `@showcase` and `@default-content` sources are authored product
 *  code, so both belong to this generic composite. Policy-specific semantic exclusions remain possible,
 *  but a package-wide generic exclusion is no longer a valid way to preserve a stable count.
 *
 *  `populationResolver`'s own test asserts `POPULATION_ROOTS` and `POPULATION_SETS` by literal, which REDS
 *  when a root is added — but it reds on the ROOT list alone and asks the author nothing about `@authored`,
 *  which is exactly how the 2026-09-11 omission passed a green suite. A mirror is not a classification.
 *
 *  THE REASON LIVES IN THE `why` FIELD AND NOWHERE ELSE. An `authoredExclusionReason(root)` accessor shipped
 *  beside this map and was DELETED 2026-09-12 (#2116): `pnpm ast refs` found one hit — its own definition —
 *  over `scanned=7518 status=complete`, while its JSDoc named two consumers ("a gate diagnostic, this
 *  contract's own test") that did not exist. A reader with no reader is a claim about an architecture
 *  nobody built; the `why` string below is the one home, and a future diagnostic reads it directly. */
const AUTHORED_MEMBERSHIP: Readonly<Record<PopulationRoot, AuthoredMembership>> = {
  "@client": { authored: true },
  "@ui": { authored: true },
  "@server": { authored: true },
  "@db": { authored: true },
  "@contracts": { authored: true },
  "@kit": { authored: true },
  "@showcase": { authored: true },
  "@default-content": { authored: true },
  "@inference": { authored: true },
  "@tooling": { authored: true },
  "@tests": { authored: true },
  "@scripts": { authored: true },
};

/** The classified roots, in `POPULATION_ROOTS` declaration order — the same order the literal carried, so
 *  the derivation is byte-comparable with what it replaced. */
const AUTHORED_ROOTS: readonly PopulationRoot[] = (Object.keys(AUTHORED_MEMBERSHIP) as readonly PopulationRoot[]).filter(
  (root) => AUTHORED_MEMBERSHIP[root].authored,
);

/** One root's membership of `@product`, with the reason an excluded root is excluded — the same shape and
 *  the same obligation as `AuthoredMembership`, for the second question a root must answer.
 *
 *  It is a SECOND type rather than a reuse because the two classifications are two different questions, and
 *  a shared discriminant would let a reader satisfy one while meaning the other — which is the `@packages`
 *  defect (#2488) reproduced inside the vocabulary that exists to prevent it.
 *  @public knip type-face false positive — the `satisfies Readonly<Record<PopulationRoot, ProductMembership>>`
 *  contract of the classification table below — what makes a missing `why` a compile error — never named at a call site. */
export type ProductMembership = { readonly product: true } | { readonly product: false; readonly why: string };

/** WHICH ROOTS `@product` MEANS — the CLASSIFICATION, from which the set below is derived (#2488).
 *
 *  `@product` is "the authored code the PRODUCT is built from": the workspace-package sources that ship as
 *  the running application, as opposed to the instrument tree (`@tooling`), the test mirror (`@tests`) and
 *  the script tree (`@scripts`). The word is the repo's own — `contract/resource-css.ts`'s
 *  `CssInventoryRequest = "authored" | "product"` and the `product-css` resource kind already draw this axis,
 *  and the constitution's test tiers draw it again (the PRODUCT node tests vs the INSTRUMENT battery). It is
 *  deliberately NOT `@runtime`: `@inference`'s own row above glosses that package as "the provider runtime",
 *  so a set named for one of its members would not identify its subject
 *  (`docs/history/type-worlds-program-2026-09-10.md` line 82).
 *
 *  EXHAUSTIVE over `PopulationRoot` by the `satisfies` below, so the enforcer is tsc (constitution §2.2 rung
 *  2): a new root that is not classified here fails with a missing-property error naming the root, exactly as
 *  `AUTHORED_MEMBERSHIP` does. The decision cannot be skipped, only made and stated — and a new package now
 *  costs TWO stated decisions rather than silently joining or silently missing either set.
 *
 *  `@product` ⊆ `@authored` by construction (a product source is authored); the subset is asserted in
 *  `tests/tooling/verify/contract/population.test.ts` rather than derived, so an exclusion that disagrees
 *  between the two maps reds instead of resolving by precedence. */
const PRODUCT_MEMBERSHIP = {
  "@client": { product: true },
  "@ui": { product: true },
  "@server": { product: true },
  "@db": { product: true },
  "@contracts": { product: true },
  "@kit": { product: true },
  "@showcase": { product: true },
  "@default-content": { product: true },
  "@inference": { product: true },
  "@tooling": {
    product: false,
    why:
      "the INSTRUMENT tree — `@orb/tooling` sits ABOVE the package cake (Core-0 §9) and ships no product runtime, " +
      "so it is the OTHER half of the product/instrument axis rather than a member of this one. A policy judging " +
      "both declares both refs (`['@product', '@tooling']`), which is what `no-raw-random` and " +
      "`caught-failure-ownership` do; `@authored` is the set that spans them",
  },
  "@tests": {
    product: false,
    why:
      "the CENTRAL test mirror (constitution §0.2) mirrors product sources rather than being them, and several " +
      "declarers exclude it for a load-bearing reason of their own — scanning tests reds their own proofs " +
      "(`freeze-provenance.ts`'s declared limit). A policy whose subject is a test declares `@tests` itself",
  },
  "@scripts": {
    product: false,
    why: "repo-level dev supervisors, probes and one-shots: authored, never shipped, and imported by nothing the product runs",
  },
} as const satisfies Readonly<Record<PopulationRoot, ProductMembership>>;

/** The classified roots, in `POPULATION_ROOTS` declaration order — the same ordering rule `AUTHORED_ROOTS`
 *  follows, so the two derived sets are read the same way. */
const PRODUCT_ROOTS: readonly PopulationRoot[] = (Object.keys(PRODUCT_MEMBERSHIP) as readonly PopulationRoot[]).filter(
  (root) => PRODUCT_MEMBERSHIP[root].product,
);

export const POPULATION_SETS = {
  "@frontend": ["@client", "@ui"],
  "@backend": ["@server", "@db", "@contracts"],
  /** THE SIX ROOTS THE DECLARING POLICIES WERE AUTHORED AGAINST — a recorded snapshot, not "the packages".
   *  Hand-typed on purpose: it must not widen when a package lands. A policy that means "the authored code
   *  the product is built from" says `@product`, whose exhaustive classification includes shipped packages. */
  "@packages": ["@client", "@ui", "@server", "@db", "@contracts", "@kit"],
  /** "the authored code the PRODUCT is built from" — DERIVED from `PRODUCT_MEMBERSHIP` above, never re-typed here. */
  "@product": PRODUCT_ROOTS,
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
