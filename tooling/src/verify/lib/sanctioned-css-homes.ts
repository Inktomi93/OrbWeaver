// The SIX CSS HOMES, named once (owner ruling 2026-09-12, #2096 / §12.3).
//
// WHAT THIS IS NOT. `lib/sanctioned-home.ts` is a READER for the tier-home exemption TABLES
// (`sanctionedHome`, `unresolvedSanctionedHomeKeys`) — a predicate over per-family allowlists. This is a
// flat LIST of the repository's six legal CSS home paths, and the two are adjacent in name only. A reader
// reaching for "the sanctioned homes" wants that module; a reader reaching for "which files may be CSS"
// wants this one.
//
// WHY IT IS HERE AND NOT IN A GATE MODULE. `sanctioned-css-homes` walks the tree and reds any product
// stylesheet that is not one of these six, two-sided (an extra CSS path OR a missing home). `playwright-css-
// topology` reads the same list to decide which CSS the Playwright harness may reference. Two policies, one
// list — and the second used to reach it by importing the first gate module directly, which the owner
// banned on 2026-09-12: **a gate module NEVER imports another gate module; a shared predicate moves to
// `lib/<family>.ts`.** `lib/contract-derives-not-respells.ts` is the worked precedent.
//
// THIS PAIR IS NOT RED TODAY, AND THE MOVE IS STILL RIGHT — the distinction matters, because a correct
// action with a wrong reason is the defect this program keeps repairing. BOTH modules are still LEGACY
// descriptors. `policy-legacy-imports` (the #2096 enforcer, `hard`/`error`, no waiver door) judges **a
// FINAL module's import doors**: its `evaluate` calls `judgeModule` only when
// `finalRegistrationOf(sourceFile) !== undefined`, so a LEGACY importer is never judged. Its `mustFlag`
// row naming this very pair is the worked example of a legacy TARGET — a FINAL module importing a legacy
// registering sibling — not of a legacy importer. So `playwright-css-topology` sits outside the arm's
// population and the pair reds nothing at present.
//
// WHY MOVE IT ANYWAY: the list is one symbol with one external consumer, so the move costs a line, and the
// pair WOULD red the day `playwright-css-topology` converts — which is a conversion lane's first surprise
// otherwise. Doing it now removes that surprise instead of banking it.
//
// NEITHER MODULE HAS A `family:` FIELD — legacy descriptors carry no such axis — so this file is named for
// the concept it holds rather than for a family id. When the pair converts, the family they declare should
// be the name this file is renamed to.

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
