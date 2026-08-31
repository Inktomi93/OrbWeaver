// The theme-integrity CLASSIFICATION ratchet (owner defect #2 widening — "make sure literally nothing
// is hardcoded to our old themes"). Every `--color-*` design token must fall into EXACTLY ONE class:
//
//   1. EMITTED           — in THEME_SCOPE_EMIT_VARS: directly overridable or clamp-derived off the base,
//                          so a CUSTOM theme recolours it. Fully themeable. (The authoritative set is
//                          `clamp.ts`; this test only cross-checks membership + partition.)
//   2. SEED_COVERED      — re-valued in every [data-theme] seed block AND acceptably static under a
//                          custom `<ThemeScope>` theme because it never sits beside derived chrome where
//                          the mismatch would read. Needs a written rationale (below).
//   3. CUSTOM_DERIVED    — static polarity-aware seed token, but derived + emitted for a carried custom
//                          base whose full accepted range cannot be served by either static arm.
//   4. STATIC_RATIONALE  — semantic-intent (destructive/success/warning/info/highlight) or genuinely
//                          theme-independent (data-viz categorical, an unused reserved alias). Rationale
//                          below.
//
// The BOTH-WAYS ratchet: the four sets must PARTITION the whole `color.*` token namespace — a NEW token
// (tokens.json) can't ship unclassified (the union check fails), and no token can be double-classified
// (the disjoint check fails). This is the machine floor that keeps a future token from silently
// reintroducing the "themes around it, stays Hearth" class the sidebar-accent/secondary/muted GAP fixes
// just closed. Consumption-in-chrome is the WHY behind a token's class; classifying the full namespace
// (not just swept consumers) is the stronger invariant — an unconsumed token is still forced to declare.
import { TOKENS } from "@orb/ui/tokens";
import { THEME_SCOPE_EMIT_VARS, THEME_SCOPE_STATIC_SEED_VARS } from "../../../../packages/ui/src/content/theme-scope/clamp.ts";
import { expect, test } from "../../../support/fixtures.ts";

type TokenPath = keyof typeof TOKENS;

const LEADING_DASHES_RE = /^--/u;
/** `--color-secondary-foreground` -> `color.secondary-foreground` (the TOKENS map key shape). */
function cssVarToTokenPath(cssVar: string): string {
  const stripped = cssVar.replace(LEADING_DASHES_RE, "");
  const dashIndex = stripped.indexOf("-");
  return `${stripped.slice(0, dashIndex)}.${stripped.slice(dashIndex + 1)}`;
}

// Class 3 — chart-1..5 are static polarity-aware tokens for seed themes and concrete derived emissions
// for a carried custom base. Either static arm fails allowed pivot-adjacent surfaces, so the custom arm
// is judged against its own base/card/raised/sidebar family while preserving categorical separation.
const CUSTOM_DERIVED = new Set(THEME_SCOPE_STATIC_SEED_VARS.map(cssVarToTokenPath));

// Class 1 — derived from the emit surface (single source: THEME_SCOPE_EMIT_VARS), scoped to colours.
const EMITTED = new Set(
  THEME_SCOPE_EMIT_VARS.filter((v) => v.startsWith("--color-"))
    .map(cssVarToTokenPath)
    .filter((path) => !CUSTOM_DERIVED.has(path)),
);

// Class 2 — seed-covered, acceptably static under a custom theme, with rationale.
//   • backdrop (was `scrim`, split at #204): a translucent DIMMING overlay (modal/sheet/rail-overlay
//     backdrop, the wallpaper-dim layer). A backdrop darkens whatever is behind it regardless of palette;
//     keeping Hearth's dark smoke under a custom theme still reads as "dimmed", never as an unthemed
//     slab beside derived chrome. Each seed block still re-authors it so the seed palettes stay coherent.
//     The over-art TEXT plate that used to share this token is `color.reading-plate` — EMITTED (class 1),
//     because a reading plate must FOLLOW the palette's polarity (a token names ONE polarity semantic).
//   • The five shadow INGREDIENTS (`shadow-hairline` / `-highlight` / `-ambient-near` / `-ambient-far` /
//     `-cta-highlight`) were class 2 from #232 until #243 MOVED THEM TO CLASS 1. The stated limit that
//     lived here — "a CUSTOM light theme keeps the base DARK ingredients, because the clamp does not
//     derive them" — is retired, not restated: `kit/theme-derivation` `shadowIngredients` now derives all
//     five off the picked base's measured polarity (the same `surfacePolarity` foregrounds and
//     `color-scheme` ride) and the clamp emits them, so they classify EMITTED automatically through
//     THEME_SCOPE_EMIT_VARS. The accent GLOW is deliberately in NO class list: it derives from
//     `--color-primary` via relative colour, so it follows EVERY theme with no token of its own.
const SEED_COVERED = new Set<string>(["color.backdrop"]);

// Class 4 — static with rationale (semantic-intent or theme-independent).
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
//   • track-1..6: the D71 track ramp (Context-Panel-Program §4.8) — a categorical ramp for
//     pool/meter/clock FILLS, keyed by definition order for stable per-category color, meaning never
//     rides color alone. STATIC (semantic, not palette-tracking) like chart-*, but since #697 it is
//     POLARITY-AWARE `light-dark()` like the divergent intents above, NOT a plain value: the gauge FILL
//     is itself a non-text UI component (WCAG 1.4.11), and the mid-L ramp cleared 3:1 on dark but only
//     1.89–2.65:1 on the light panel. The DARK arm is the original ramp (byte-identical); the LIGHT arm
//     darkens each hue to clear ≥3:1 while the 6 stay mutually distinguishable — the categorical
//     mechanism survived, its light-polarity INPUT changed. Still class 3 (the active arm follows
//     color-scheme, exactly like destructive/success/warning/info).
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
//     restricted to the ThemeScope-emitted class + backdrop). It replaced three bare `oklch(1 0 0 / 0.0N)`
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
  for (const path of [...EMITTED, ...SEED_COVERED, ...CUSTOM_DERIVED, ...STATIC_RATIONALE]) {
    expect(TOKENS[path as TokenPath], `${path} must exist in TOKENS`).toBeDefined();
  }
});

test("the four classes are pairwise DISJOINT (no token classified twice)", () => {
  const overlap = (a: Set<string>, b: Set<string>): string[] => [...a].filter((x) => b.has(x));
  expect(overlap(EMITTED, SEED_COVERED)).toEqual([]);
  expect(overlap(EMITTED, CUSTOM_DERIVED)).toEqual([]);
  expect(overlap(EMITTED, STATIC_RATIONALE)).toEqual([]);
  expect(overlap(SEED_COVERED, CUSTOM_DERIVED)).toEqual([]);
  expect(overlap(SEED_COVERED, STATIC_RATIONALE)).toEqual([]);
  expect(overlap(CUSTOM_DERIVED, STATIC_RATIONALE)).toEqual([]);
});

test("the four classes PARTITION every --color-* token (no unclassified token can ship)", () => {
  const classified = new Set([...EMITTED, ...SEED_COVERED, ...CUSTOM_DERIVED, ...STATIC_RATIONALE]);
  // Every real colour token is classified (a new tokens.json colour fails here until it is placed).
  const unclassified = ALL_COLOR_TOKENS.filter((path) => !classified.has(path));
  expect(unclassified, "unclassified --color-* tokens — place each in a class in this file").toEqual([]);
  // …and every classified path is a real token (a stale/renamed classification fails here).
  const stale = [...classified].filter((path) => !ALL_COLOR_TOKENS.includes(path));
  expect(stale, "classified paths with no matching token — a rename left a stale entry").toEqual([]);
});
