// THE SIX CSS HOMES, named once (owner ruling 2026-09-12, #2096 / §12.3) — and the FAMILY READER for the
// `css-home-topology` pair: `sanctioned-css-homes` (which homes may exist) and `playwright-css-topology`
// (which homes the front doors must reach).
//
// RENAMED FROM `lib/sanctioned-css-homes.ts` when the pair CONVERTED (#2183, 2026-09-13), on the
// instruction its own previous header left: *"when the pair converts, the family they declare should be
// the name this file is renamed to."* The old name was one POLICY ID, which is exactly the wrong name for
// a two-member family — a reader meeting `family: "sanctioned-css-homes"` on `playwright-css-topology`
// cannot tell a family from an import.
//
// WHAT THIS IS NOT. `lib/sanctioned-home.ts` is a READER for the tier-home exemption TABLES
// (`sanctionedHome`, `unresolvedSanctionedHomeKeys`) — a predicate over per-family allowlists. This is a
// flat LIST of the repository's six legal CSS home paths, and the two are adjacent in name only. A reader
// reaching for "the sanctioned homes" wants that module; a reader reaching for "which files may be CSS"
// wants this one.
//
// IT IS POLICY DATA AND IT STAYS A PLAIN CONST. §12.5 bans a gate-owned exemption table, and this is not
// one: there is no `why`, no `endsWhen`, nothing suppressed, and it is not a population subtraction. It is
// the ADMITTED set both policies compare against — the same nature as `server-layout`'s `REQUIRED_TIERS`.
// A reviewed grant is the wrong home for it twice over: a grant is 1:1 against a candidate finding
// (§12.5), and these six are the rule rather than exceptions to it.

/** The six legal CSS/token homes. Order is the authored/generated reading order, not a preference: the DTCG
 *  token SOURCE first, then the generated theme, then the hand-authored sheets, then the one structural
 *  shell file. `client-architecture-lockdown.md` §4 is the law; this is its path-closed spelling. */
export const SANCTIONED_CSS_HOMES = [
  "packages/ui/src/tokens/tokens.json",
  "packages/ui/src/styles/theme.css",
  "packages/ui/src/styles/globals.css",
  "packages/ui/src/styles/tiers.css",
  "packages/client/src/styles/globals.css",
  "packages/client/src/features/app-shell/surfaces/shell.css",
] as const;

/** The five STYLESHEET homes — the token vault is a `.json` source and is not part of any CSS import graph.
 *  Both members of the family ask this question, and each spelling its own `.endsWith(".css")` filter is
 *  how the two lists drift apart when a seventh home lands. */
export const SANCTIONED_CSS_STYLESHEETS = SANCTIONED_CSS_HOMES.filter((home) => home.endsWith(".css"));
