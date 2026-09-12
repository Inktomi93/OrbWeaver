// The SHARED TABLE for the `raw-spacing-tier` family (owner ruling 2026-09-12, #2096 / §12.3): the
// sanctioned homes both halves judge, and the ONE place a row is added or retired.
//
// WHY IT IS HERE AND NOT IN A GATE MODULE. `no-raw-spacing-in-features` reads this table to SKIP a report
// (a cited home may spell the raw utility), and `spacing-tier-home-health` reads the SAME table to prove
// every row still resolves to a real path — a two-sided ratchet only works while both halves read one
// table. The health sibling used to reach it by importing the occurrence gate module directly, which the
// owner banned on 2026-09-12: **a gate module NEVER imports another gate module; a shared predicate moves
// to `lib/<family>.ts`.** `lib/contract-derives-not-respells.ts` is the worked precedent. A gate module is
// a POLICY — one descriptor, one verdict — and a second policy importing it takes a dependency on somebody
// else's enforcement surface, so a change made for one arm silently re-aims the other.
//
// UNLIKE `lib/tenancy-scope.ts`'s registry, this table moved WITHOUT a naming-convention cost: its keys are
// PATH PREFIXES, not SQL identifiers, so `useNamingConvention` has nothing to rename and no suppression or
// key rewrite was needed to bring it here.
//
// THE TABLE IS A CLAIM, NOT A PARKING SPACE. Each row says WHY the home may spell the raw utility and what
// ENDS it; `spacing-tier-home-health` reds any row whose path no longer resolves, so a row cannot outlive
// the directory it names.
import type { ExemptionTable } from "../contract/gate.ts";

export const SANCTIONED_HOMES: ExemptionTable = {
  "packages/ui/src/layout/": {
    why: "the layout primitives (<Stack>/<Row>/<Section>/<Toolbar>) ARE the implementation of the intent tokens — they must spell the raw utility once so no feature ever does. Ends when the primitives move: the rename tripwire reds the row at its dead path",
  },
  "packages/ui/src/markdown/": {
    why: "the markdown renderer maps prose elements onto the same spacing scale by hand — a token-only rewrite is the end condition, and the rename tripwire reds the row the day the renderer moves",
  },
};
