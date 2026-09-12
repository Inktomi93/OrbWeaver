// The SHARED VOCABULARY for the `context-definition-shape` family (owner ruling 2026-09-12, #2096 /
// §12.3): the three names both halves must spell IDENTICALLY, and nothing else.
//
// WHY IT IS HERE AND NOT IN A GATE MODULE. `context-definition-shape` judges each definition literal;
// `context-definition-shape-health` COUNTS the mint and the probe attribute across the whole tree to prove
// the single-writer invariant. Both verdicts are about the same three names, so a name that drifted in one
// module and not the other would leave the occurrence policy judging a vocabulary the tripwire no longer
// guards. The health sibling used to reach them by importing the occurrence gate module directly, which
// the owner banned on 2026-09-12: **a gate module NEVER imports another gate module; a shared predicate
// moves to `lib/<family>.ts`.** `lib/contract-derives-not-respells.ts` is the worked precedent.
//
// ONLY THE SHARED THREE MOVED, DELIBERATELY. `context-definition-shape.ts` also exports `FEATURES_RE`,
// `APP_SHELL_RE` and `SHELL_CHROME_CLASSES`, and those did NOT come with them: no second module reads any
// of the three, so moving them would put single-consumer data in a shared home and invite the next reader
// to treat `lib/` as the default home rather than the SHARED one. A `lib/` module earns its place by
// having two readers; the rest stays with its one.

/** The ONE legal minter of both context-definition literal shapes. */
export const REGISTRY_CONTRACTS_RE = /\/lib\/registry-contracts\.ts$/u;

/** The probe attribute whose single-writer invariant the `-health` sibling counts. */
export const REGION_ATTR = "data-context-bracket";

/** The region mint whose single-call-site invariant the `-health` sibling counts. */
export const DEFINE_CONTEXT_REGION = "defineContextRegion";
