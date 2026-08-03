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
import { THEME_SCOPE_EMIT_VARS } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import { expect, test } from "../../../support/fixtures.ts";

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
//     not palette-tracking). The seed value-sets deliberately do NOT re-author them; the 4 divergent
//     intents (destructive/success/warning/info) are ONE static token with light-dark() polarity arms
//     (D71) — the active arm follows color-scheme (seed blocks flip it; the clamp derives it for custom
//     themes). highlight (+ its foreground) is POLARITY-INDEPENDENT (a text-mark BACKGROUND, never text) —
//     a single plain oklch (the former no-op light-dark(X,X) was collapsed, §W6). All locked to their AA
//     floors per palette AND per polarity by the palette-contrast per-value-set sweep.
//   • sidebar-primary: an unused reserved alias of `primary` (0 consumers — the rail active state reads
//     `--color-primary` directly). No chrome renders it, so nothing to theme.
//   • chart-1..5: a categorical data-viz ramp — the five hues are chosen for mutual DISTINGUISHABILITY,
//     not to track the surface palette; recolouring them off the base would collapse the categories.
//   • track-1..6: the D71 track ramp (Context-Panel-Program §4.8) — the SAME species as chart-*: a
//     categorical ramp for pool/meter/clock FILLS, keyed by definition order for stable per-category
//     color; base-only (a theme json MAY override, none is required to), meaning never rides color alone.
//   • sky-*: the Waystone ATMOSPHERIC palette (day/night/ember/twilight/star/cloud/rain/ash). Static for a
//     STRONGER reason than the ramps — these are POLARITY-FIXED depictions, not palette roles: a night sky
//     is dark and starlight is bright in EVERY theme, because that is what a night sky IS. Theming them
//     off the base is the defect they were minted to fix (the stone painted its sky by mixing the
//     categorical ramp toward --color-background, which inverted day/night on the Light seed — midnight
//     rendered lighter than noon, and --color-foreground stars turned to dirt). The stone's CHROME (ring,
//     bezel, horizon line, text) stays fully theme-reactive via the EMITTED class; only the depicted sky
//     inside it is fixed, so a custom theme still recolours everything a palette legitimately owns.
//   • sheen: the POLARITY-FIXED gloss highlight at the FOOT of the gradient-border glows (CTA ring,
//     active tab, active rail button) — the same species as sky-*: a depiction (a light source glancing
//     off a raised edge), not a palette role, so it is white on every seed while the glow's HEAD stays
//     fully theme-reactive (--color-primary). Base-only by design: a theme MAY re-bind it (a light theme
//     wanting a dark gloss), none is required to, and no seed value-set carries it (the seed sets are
//     restricted to the ThemeScope-emitted class + scrim). It replaced three bare `oklch(1 0 0 / 0.0N)`
//     literals, so the token's job is making that choice visible and overridable, not palette-tracking.
const STATIC_RATIONALE = new Set<string>([
  "color.sheen",
  "color.destructive",
  "color.destructive-foreground",
  "color.success",
  "color.success-foreground",
  "color.warning",
  "color.warning-foreground",
  "color.info",
  "color.info-foreground",
  "color.highlight",
  "color.highlight-foreground",
  "color.sidebar-primary",
  "color.chart-1",
  "color.chart-2",
  "color.chart-3",
  "color.chart-4",
  "color.chart-5",
  "color.track-1",
  "color.track-2",
  "color.track-3",
  "color.track-4",
  "color.track-5",
  "color.track-6",
  "color.sky-day",
  "color.sky-day-horizon",
  "color.sky-night",
  "color.sky-night-horizon",
  "color.sky-ember",
  "color.sky-ember-deep",
  "color.sky-twilight",
  "color.sky-star",
  "color.sky-cloud",
  "color.sky-cloud-dark",
  "color.sky-rain",
  "color.sky-ash",
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
