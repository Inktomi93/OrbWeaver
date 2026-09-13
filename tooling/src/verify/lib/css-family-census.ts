// The CSS family's shared VOCABULARY: the closed runtime-writer seams, the density grammar, the theme
// namespace derivation, and the hook-ownership records the provenance fact accumulates.
//
// WHAT THE #1584 CONVERSION DELETED FROM THIS FILE, and why nothing was left beside it. Until the
// conversion this module also owned a FILESYSTEM READER — `readCensus(root)` (`existsSync`/`readFileSync`
// over the five product stylesheets) plus a SECOND CSS parser (`readDirectThemeDeclarations`,
// `blankNestedBlocks`, `matchingBrace`) written because `parseCssRules` descends at-rules to STYLE rules
// and could not express "direct declarations of an at-rule block". Both retire:
//
//   * the read is `ctx.resources.cssInventory("product")`, the closed `product-css` identity;
//   * the direct-`@theme` question is `AuthoredCssFile.atRules` — `CssAtRule.declarations` is *declarations
//     authored directly in this block; nested rules/at-rules are separate parser facts*, which is the exact
//     predicate the hand parser existed to supply. MEASURED BYTE-IDENTICAL on the real tree at `1692583d6`:
//     the shared parser reports 203 direct `@theme` declarations (all custom properties) against the hand
//     parser's 203, and 109 rule declarations against the fixture's `themeRules: 109`.
//
// `cssFamilyFinding` retires with them. It minted a legacy `Finding` at a synthetic `column: 1` with a
// composite token (`class:x`, `<selector> { <prop>: <value> }`) — guide §3's class-2 shape, where
// `locateFinding` cannot bind because the token is not authored text at that coordinate. Every surviving
// finding is re-anchored on the AUTHORED SLICE at its real column, which is what gives the ordinary door
// a position an author can type.
//
// `EXPECTED_DIRECT_THEME_DECLARATIONS` IS UNTOUCHED AND STILL COMPARED. Its disposition is OWNER-PENDING
// (#2230, `css-family-audit-2026-09-12.md` ledger rows 12/13: the constant IS derivable from
// `tokens.build.ts#renderThemeCss`, and whether a hand-copied literal earns the name "generated-output
// parity" is escalated, not settled). This lane READS it and moves nothing.
//
// THE FOUR BARE COUNT RATCHETS ARE RETIRED (audit ledger row 11, §12.5 "no count ratchet"), and the
// distinction matters: `EXPECTED_RUNTIME_WRITERS`' three surviving keys are DERIVED from this module's own
// vocabulary set sizes, so each is a COMPLETENESS claim ("every declared seam × every declared selector is
// written exactly once"), not a population count — a legitimate new declaration changes both sides at once.
// `fade: 12` was a bare literal over the current population and had no such derivation; it is deleted.
// `EXPECTED_DIRECT_CLIENT_UI_MECHANISMS`' three counts were the same shape wrapped around an EXEMPTION, so
// the exemption moved to three 1:1 reviewed grants with central liveness
// (`gates/css-family-direct-client-mechanism.ts`) and the counts died with the table.
import type { CssDeclarationFact } from "../contract/resource-css.ts";

export interface HookOwners {
  readonly ui: boolean;
  readonly client: boolean;
}

export const DENSITY_SPACING = new Set(["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section"]);
export const DENSITY_SELECTORS = new Set(['[data-density="comfortable"]', '[data-density="compact"]']);
export const CLIENT_BLUR_FILL = new Set(["--blur-fill-chrome", "--blur-fill-dense"]);
export const CLIENT_COLORIZATION = new Set(["--color-border", "--color-sidebar-border"]);
export const LOCAL_FADE_STOP_RE = /^--fade-(?:start|end|top|bottom)-stop$/u;
export const KEYFRAME_STEP_RE = /^(?:from|to|\d+%(?:\s*,\s*\d+%)*)$/u;
export const KNOWN_DENSITY_FLOOR = '[data-slot="list-row-subtitle"][data-subtitle-step="label"]';
const CLASS_TOKEN_RE = /^[A-Za-z_][\w-]*$/u;

// `EXPECTED_RUNTIME_WRITERS` IS GONE (#2305). It survived the first conversion leg as three "derived"
// cardinalities, and two of the three were not derived at all: `blur` and `colorization` multiplied a
// declared set by a BARE LITERAL `2` that named no vocabulary, so a third legitimate carrier reddened the
// gate with no vocabulary edit — the current-population ratchet §12.5 bans, under a derivation's name. The
// seams keep their VOCABULARIES (the four sets above) and `lib/css-family-policy.ts` now asks COVERAGE of
// them: every declared member written at least once, no occurrence counted anywhere.

const SOURCE_OWNERS = [
  { prefix: "packages/ui/src/", owner: "ui" },
  { prefix: "packages/client/src/", owner: "client" },
] as const;

// THE FIVE PER-SHEET DECLARATION COUNTS AND THE AGGREGATE TOTAL ARE RETIRED (#2181, 2026-09-12). This
// EXECUTES a recorded disposition rather than minting one: `exception-authority-census.md:178` reads
// "CSS `EXPECTED_DIRECT_THEME_DECLARATIONS` is generated-output parity; the five per-file declaration
// counts and aggregate total are current-population counts and retire", and §12.5 names that file as the
// dispositions home. A count over N subjects can never become a strictly-1:1 reviewed grant.
//
// THE ~140 LINES OF MINT RATIONALE THEY CARRIED ARE MOVED, NEVER DELETED, to
// `docs/design/951-css-family-semantic-provenance.md` §7 — the counts were current-population, but the
// reasoning (the crown-gold 1.41-1.71:1 measurement behind `--color-accolade`, the iOS 16px field floor
// and why `text.body` got no coarse arm, the 48 unpassable findings that forced the
// `--color-selection-quiet` pair) is design record nobody could reconstruct from the stylesheets.
//
// `EXPECTED_DIRECT_THEME_DECLARATIONS` SURVIVES THIS LEG, AND ITS SURVIVAL IS NOT AN ENDORSEMENT. The
// same disposition classes it as generated-output PARITY rather than a current-population count. On the
// tree it is still a hand-copied literal compared against a parsed count — the same SHAPE as the three
// ratchets `css-var-defined` retired the same day, under a different word. Whether it must DERIVE from
// the generator's input (tokens.json -> the emitted @theme block) to earn the name is ESCALATED and
// deliberately undecided here (#2230); §7 of the design doc records the open ruling.
export const EXPECTED_DIRECT_THEME_DECLARATIONS = 203;

export const MESSAGE =
  "a declaration is inside a sanctioned CSS path but belongs to another semantic family (#951 / client-architecture-lockdown.md §4.3): legal path is not responsibility";

export function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    line += text.charCodeAt(index) === 10 ? 1 : 0;
  }
  return line;
}

export function sourceOwner(rel: string): "ui" | "client" | undefined {
  return SOURCE_OWNERS.find((row) => rel.startsWith(row.prefix))?.owner;
}

export function recordOwner(map: Map<string, HookOwners>, hook: string, owner: "ui" | "client"): void {
  const before = map.get(hook) ?? { ui: false, client: false };
  map.set(hook, { ui: before.ui || owner === "ui", client: before.client || owner === "client" });
}

export function recordClassTokens(map: Map<string, HookOwners>, text: string, owner: "ui" | "client"): void {
  for (const token of text.split(/\s+/u)) {
    if (CLASS_TOKEN_RE.test(token)) {
      recordOwner(map, `class:${token}`, owner);
    }
  }
}

/** The generated token families the direct `@theme` block mints — the namespaces no other sheet may write
 *  into without one of the closed runtime-writer seams. */
export function themeFamilyPrefixes(directTheme: readonly CssDeclarationFact[]): ReadonlySet<string> {
  const prefixes = new Set<string>();
  for (const { property } of directTheme) {
    const family = /^--([a-z0-9]+)-/u.exec(property)?.[1];
    if (family !== undefined) {
      prefixes.add(`--${family}-`);
    }
  }
  return prefixes;
}
