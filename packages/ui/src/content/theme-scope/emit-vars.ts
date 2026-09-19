// THE THEME SCOPE'S EMIT SURFACE — the ROSTER of every `--*` custom property `clampThemeTokens` can
// write, and the subset whose SEED form stays a static polarity token. Spellings only: not one line here
// decides anything, which is exactly why they are not in `clamp.ts` (that file owns the POLICY — what a
// picked base derives and what a clamp refuses — and it crossed the 450-line primitive cap carrying both).
// The same seam `color-parse.ts` already cut for the READERS, cut once more for the NAMES.
//
// THE ROSTER IS A CLAIM THE SUITES CHECK, not documentation: `tests/ui/content/theme-scope/
// emit-surface.suite.test.ts` asserts the keys `clampThemeTokens` actually writes equal this list exactly,
// `token-classification.suite.test.ts` pins the two lists against each other, and `packages/ui/
// tokens.build.ts` reads both at build time. So a var added to the clamp without a row here is RED, and a
// row here with no emit is RED — neither half can drift alone.

// Every `--*` custom property `clampThemeTokens` can emit — must stay in sync with the put()/vars[...]
// assignments in `clamp.ts` (an emit-surface test asserts the actual output keys match this list exactly).
export const THEME_SCOPE_EMIT_VARS = [
  "--color-primary",
  "--color-ring",
  "--color-primary-foreground",
  "--color-user-bubble",
  "--color-user-bubble-foreground",
  "--color-ai-bubble",
  "--color-ai-bubble-foreground",
  "--color-system-bubble",
  "--color-system-bubble-foreground",
  "--color-speaker",
  "--color-dialogue",
  "--color-narration",
  "--color-prose-body",
  "--color-background",
  // The neutral surface ramp, derived from `background` — a user picks one base surface and the
  // sidebar/panel/card/popover chrome derives coherently.
  "--color-sidebar",
  "--color-surface-raised",
  "--color-card",
  "--color-popover",
  "--color-accent",
  "--color-accent-foreground",
  "--color-sidebar-accent",
  "--color-sidebar-accent-foreground",
  "--color-secondary",
  "--color-secondary-foreground",
  "--color-muted",
  // The over-art READING PLATE (#204): base + readingPlate.deltaL, carrying the polarity-derived plate
  // alpha (#217) — the one ramp member with its own alpha, because it composites over wallpaper art.
  // Never `--color-backdrop`.
  "--color-reading-plate",
  "--color-reading-plate-foreground",
  // …and its OPAQUE sibling, the sticky attribution BAND (#241): the SAME derived colour at alpha 1, so
  // the band and the prose plate under it can never step apart. Emitted rather than left to the base
  // theme because it backs the CARRIED palette's own prose — the #204 two-polarity paragraph.
  "--color-reading-band",
  // Neutral foregrounds, derived for contrast from the surface they sit on — never picked directly.
  "--color-foreground",
  "--color-card-foreground",
  "--color-popover-foreground",
  "--color-sidebar-foreground",
  "--color-muted-foreground",
  // The UI border: an explicit borderColor when set, else derived from the base surface.
  "--color-border",
  "--color-sidebar-border",
  "--color-input",
  // A carried palette cannot inherit one static polarity arm around the L=.62 pivot: derive five
  // concrete categorical fills against its own base/card/raised/sidebar family (#939).
  "--color-chart-1",
  "--color-chart-2",
  "--color-chart-3",
  "--color-chart-4",
  "--color-chart-5",
  // The five ELEVATION INGREDIENTS of `--shadow-overlay` / `--shadow-cta` (#243, closing #232's recorded
  // residual). Derived from the picked base's POLARITY, never picked: a custom light theme used to
  // inherit the base palette's dark smoke (a 1.00:1 white ring, a near-black halo). They are colours
  // rather than the composite because Tailwind v4 inlines a `--shadow-*` @theme value into its utility at
  // build time — only a var() ingredient survives that and resolves in scope.
  "--color-shadow-hairline",
  "--color-shadow-highlight",
  "--color-shadow-ambient-near",
  "--color-shadow-ambient-far",
  "--color-shadow-cta-highlight",
  "--font-sans",
  "--radius-card",
] as const;

/**
 * ThemeScope-emitted colors whose SEED form stays the canonical static polarity token. Seed themes use
 * the generated light-dark() arms; only a carried custom base needs a per-surface concrete derivation.
 *
 * @public The token BUILD reads it (`packages/ui/tokens.build.ts`, the `tokens:build` script) alongside
 * `THEME_SCOPE_EMIT_VARS`, and the classification suite pins the two lists against each other. Neither
 * reader is on the shipped runtime path, which is why the export has no production importer.
 */
export const THEME_SCOPE_STATIC_SEED_VARS = ["--color-chart-1", "--color-chart-2", "--color-chart-3", "--color-chart-4", "--color-chart-5"] as const;
