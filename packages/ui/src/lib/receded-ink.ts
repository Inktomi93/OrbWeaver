// THE ONE SPELLING FOR "THIS CONTROL RECEDES" — the rest ink a COMPOSITE states for the quiet half of a
// two-weight pair, when the pair's design ruling is "two controls at two weights".
//
// WHY IT EXISTS (#1249, 2026-09-02). 242bfaecb (#969)
// flipped `Button`'s `secondary`, `ghost` and `outline`
// intents from named ink to `text-current`, so a transparent action inherits its host surface's paired ink.
// That is CORRECT and stays: it is what makes those intents TOTAL over the accepted base foregrounds, and
// reverting it re-breaks the painting on every non-default surface. What it also did — the reason this
// module exists — is erase the RECESSION half of every composite that got its quiet weight for free from
// `ghost`/`outline` painting `muted-foreground`. A named-ink action beside such a trigger now computes the
// SAME colour, and the hierarchy the ruling bought is gone.
//
// SO THE RECESSION IS STATED AT THE COMPOSITE, never by re-flipping the primitive: re-flipping would undo
// #969 repo-wide, while stating it at the composite lands the fix at every consumer of that composite rather
// than at the one instance a CT happened to probe. Three composites hit this independently — the character
// filter rail (#1141), `RowActionsMenu`'s overflow trigger (#1244), and the corpus room door (#1249) — and
// two of the three reached for a local constant of their own, which is what this one replaces. Every site
// that asks to recede now says so with the SAME importable name, so "who asked to recede" is an enumerable
// set rather than a colour class retyped per call site.
//
// USE IT UNPREFIXED, on the composite's own control. Unprefixed is load-bearing: `ACCENT_HOVER`'s
// `hover:text-accent-foreground` is a variant key tailwind-merge keeps and a more specific selector, so the
// control still lights on hover — the recession is about REST, which is the only state these rulings are
// about. A control with a SELECTED arm carries it on the resting arm only (a call-site ink would win the
// merge and erase the selection's own pairing — see `character-filter-rail-parts.tsx`).
export const RECEDED_INK = "text-muted-foreground";
