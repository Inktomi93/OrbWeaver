// The SHARED VOCABULARY for the `context-definition-shape` family (owner ruling 2026-09-12, #2096 /
// §12.3): the two names both halves must spell IDENTICALLY, and nothing else.
//
// WHY IT IS HERE AND NOT IN A GATE MODULE. `context-definition-shape` judges each definition literal;
// `context-definition-shape-health` COUNTS the same region mint across the whole tree to prove the
// single-writer invariant. Both verdicts use the mint-file identity and region-mint name, so either drifting
// in one module would leave the occurrence policy judging vocabulary the tripwire no longer guards. The
// health sibling used to reach them by importing the occurrence gate module directly, which the owner
// banned on 2026-09-12: **a gate module NEVER imports another gate module; a shared predicate moves to
// `lib/<family>.ts`.** `lib/contract-derives-not-respells.ts` is the worked precedent.
//
// ONLY THE SHARED TWO MOVED, DELIBERATELY. The health-only `data-context-bracket` attribute stays with its
// one occurrence counter. `context-definition-shape.ts` also exports `FEATURES_RE`, `APP_SHELL_RE` and
// `SHELL_CHROME_CLASSES`; no second module reads them either. Moving any of those single-consumer values
// would invite the next reader to treat `lib/` as the default home rather than the SHARED one. A `lib/`
// module earns its place by having two readers; the rest stays with its one.

/** The ONE legal minter of both context-definition literal shapes. */
export const REGISTRY_CONTRACTS_RE = /\/lib\/registry-contracts\.ts$/u;

/** The region mint whose single-call-site invariant the `-health` sibling counts. */
export const DEFINE_CONTEXT_REGION = "defineContextRegion";
