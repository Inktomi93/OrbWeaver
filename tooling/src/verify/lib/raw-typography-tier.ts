// The SHARED TABLE for the `raw-typography-tier` family (owner ruling 2026-09-12, #2096 / §12.3): the
// sanctioned homes both halves judge, and the ONE place a row is added or retired.
//
// WHY IT IS HERE AND NOT IN A GATE MODULE. `no-raw-typography-in-features` reads this table to SKIP a
// report (a cited home may spell the raw utility), and `typography-tier-home-health` reads the SAME table
// to prove every row still resolves to a real path — a two-sided ratchet only works while both halves read
// one table. The health sibling used to reach it by importing the occurrence gate module directly, which
// the owner banned on 2026-09-12: **a gate module NEVER imports another gate module; a shared predicate
// moves to `lib/<family>.ts`.** `lib/contract-derives-not-respells.ts` is the worked precedent. A gate
// module is a POLICY — one descriptor, one verdict — and a second policy importing it takes a dependency on
// somebody else's enforcement surface, so a change made for one arm silently re-aims the other.
//
// THE TWIN TABLE IS A SEPARATE FILE ON PURPOSE. `lib/raw-spacing-tier.ts` holds the same TWO PATHS today,
// and merging them would read as one shared table for two families. They are two tables that currently
// agree: a spacing home earns its row because the layout primitives implement the SPACING scale, and a
// typography home because they implement the TYPE scale. Either can retire without the other, and each
// family's `-health` sibling reds only its own rows — a shared table would couple two ratchets that have
// no reason to move together. Family is the unit, not the value.
import type { ExemptionTable } from "../contract/gate.ts";

export const SANCTIONED_HOMES: ExemptionTable = {
  "packages/ui/src/layout/": {
    why: "the layout primitives (<Stack>/<Row>/<Section>/<Toolbar>) ARE the implementation of the typography tokens — they must spell the raw utility once so no feature ever does. Ends when the primitives move: the rename tripwire reds the row at its dead path",
  },
  "packages/ui/src/markdown/": {
    why: "the markdown renderer maps prose elements onto the same typography scale by hand — a token-only rewrite is the end condition, and the rename tripwire reds the row the day the renderer moves",
  },
};
