// The theme-integrity CLASSIFICATION ratchet (owner defect #2 widening — "make sure literally nothing
// is hardcoded to our old themes"). Every `--color-*` design token must fall into EXACTLY ONE class:
//
//   1. EMITTED           — in THEME_SCOPE_EMIT_VARS: directly overridable or clamp-derived off the base,
//                          so a CUSTOM theme recolours it. Fully themeable. (The authoritative set is
//                          `clamp.ts`; this test only cross-checks membership + partition.)
//   2. SEED_COVERED      — re-valued in every [data-theme] seed block AND acceptably static under a
//                          custom `<ThemeScope>` theme because it never sits beside derived chrome where
//                          the mismatch would read. Needs a written rationale (below).
//   3. STATIC_RATIONALE  — semantic-intent (destructive/success/warning/info/highlight) or genuinely
//                          theme-independent (data-viz categorical, an unused reserved alias). Rationale
//                          below.
//
// The BOTH-WAYS ratchet: the three sets must PARTITION the whole `color.*` token namespace — a NEW token
// (tokens.json) can't ship unclassified (the union check fails), and no token can be double-classified
// (the disjoint check fails). This is the machine floor that keeps a future token from silently
// reintroducing the "themes around it, stays Hearth" class the sidebar-accent/secondary/muted GAP fixes
// just closed. Consumption-in-chrome is the WHY behind a token's class; classifying the full namespace
// (not just swept consumers) is the stronger invariant — an unconsumed token is still forced to declare.
import { TOKENS } from "@orb/ui/tokens";
import { THEME_SCOPE_EMIT_VARS } from "../../../../packages/ui/src/content/theme-scope/clamp";
import { expect, test } from "../../../support/fixtures";

type TokenPath = keyof typeof TOKENS;

const LEADING_DASHES_RE = /^--/u;
/** `--color-secondary-foreground` -> `color.secondary-foreground` (the TOKENS map key shape). */
function cssVarToTokenPath(cssVar: string): string {
  const stripped = cssVar.replace(LEADING_DASHES_RE, "");
  const dashIndex = stripped.indexOf("-");
  return `${stripped.slice(0, dashIndex)}.${stripped.slice(dashIndex + 1)}`;
}

// Class 1 — derived from the emit surface (single source: THEME_SCOPE_EMIT_VARS), scoped to colours.
const EMITTED = new Set(THEME_SCOPE_EMIT_VARS.filter((v) => v.startsWith("--color-")).map(cssVarToTokenPath));

// Class 2 — seed-covered, acceptably static under a custom theme, with rationale.
//   • scrim: a translucent DIMMING overlay (modal/sheet/rail-overlay backdrop). A scrim darkens whatever
//     is behind it regardless of palette; keeping Hearth's dark scrim under a custom theme still reads as
//     "dimmed", never as an unthemed slab beside derived chrome. Each seed block still re-authors it (a
//     light seed lightens it) so the seed palettes stay coherent.
const SEED_COVERED = new Set<string>(["color.scrim"]);

// Class 3 — static with rationale (semantic-intent or theme-independent).
//   • destructive/success/warning/info/highlight (+ their foregrounds): SEMANTIC-intent colours — a
//     delete is red, a success green, a warning amber on EVERY palette (WCAG-legibility is the constraint,
//     not palette-tracking). The seed value-sets deliberately do NOT re-author them; instead each is ONE
//     static token with light-dark() polarity arms (D71) — the active arm follows color-scheme (seed
//     blocks flip it; the clamp derives it for custom themes). Locked to their AA floors per palette AND
//     per polarity by the palette-contrast per-value-set sweep.
//   • sidebar-primary: an unused reserved alias of `primary` (0 consumers — the rail active state reads
//     `--color-primary` directly). No chrome renders it, so nothing to theme.
//   • chart-1..5: a categorical data-viz ramp — the five hues are chosen for mutual DISTINGUISHABILITY,
//     not to track the surface palette; recolouring them off the base would collapse the categories.
const STATIC_RATIONALE = new Set<string>([
  "color.destructive",
  "color.destructive-foreground",
  "color.success",
  "color.success-foreground",
  "color.warning",
  "color.warning-foreground",
  "color.info",
  "color.highlight",
  "color.highlight-foreground",
  "color.sidebar-primary",
  "color.chart-1",
  "color.chart-2",
  "color.chart-3",
  "color.chart-4",
  "color.chart-5",
]);

const ALL_COLOR_TOKENS = Object.keys(TOKENS).filter((k) => k.startsWith("color."));

test("every classified token references a real token in the generated TOKENS map", () => {
  for (const path of [...EMITTED, ...SEED_COVERED, ...STATIC_RATIONALE]) {
    expect(TOKENS[path as TokenPath], `${path} must exist in TOKENS`).toBeDefined();
  }
});

test("the three classes are pairwise DISJOINT (no token classified twice)", () => {
  const overlap = (a: Set<string>, b: Set<string>): string[] => [...a].filter((x) => b.has(x));
  expect(overlap(EMITTED, SEED_COVERED)).toEqual([]);
  expect(overlap(EMITTED, STATIC_RATIONALE)).toEqual([]);
  expect(overlap(SEED_COVERED, STATIC_RATIONALE)).toEqual([]);
});

test("the three classes PARTITION every --color-* token (no unclassified token can ship)", () => {
  const classified = new Set([...EMITTED, ...SEED_COVERED, ...STATIC_RATIONALE]);
  // Every real colour token is classified (a new tokens.json colour fails here until it is placed).
  const unclassified = ALL_COLOR_TOKENS.filter((path) => !classified.has(path));
  expect(unclassified, "unclassified --color-* tokens — place each in a class in this file").toEqual([]);
  // …and every classified path is a real token (a stale/renamed classification fails here).
  const stale = [...classified].filter((path) => !ALL_COLOR_TOKENS.includes(path));
  expect(stale, "classified paths with no matching token — a rename left a stale entry").toEqual([]);
});
