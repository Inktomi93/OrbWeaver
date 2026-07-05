// THEME_OPTIONS — the interim theme picker's option SET (ux-flow-revamp J8 · UIP-402). The set is LAW at
// UI-Theming-and-Content.md §12.1: **Hearth (active) · Mocha · Light (deferred)** — NEVER the seed
// mockup's Catppuccin/Loom names ("Loom" is the CUT structural mode; never reuse it for a palette). A
// registry-as-data list so the picker renders from it (no bespoke JSX per row).
//
// PERSISTENCE GAP — FLAGGED, NOT FAKED (J8 verdict): the §12.1 theme persistence (the `theme` settings
// namespace holding `selectedThemeId`, the `themes` entity + CRUD, the built-in seed rows) is UNBUILT
// (`proposed/themes-design.md` — server/contracts/db all pending; zero Mocha/Light token values exist).
// So the picker is HONEST: Hearth is `available` + active; Mocha/Light are `available: false`
// (disabled-with-tooltip). There is NO switch action here — wiring `selectedThemeId` is real work for the
// persistence lane, and a no-op toggle would be the exact "fake toggle that no-ops silently" J8 forbids.
// When persistence lands, the switch mechanism + the real Mocha/Light token sets arrive together.

/** One selectable palette. `available: false` ⇒ disabled-with-tooltip (deferred until §12.1 persistence). */
export interface ThemeOption {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** `true` only for Hearth today — the one live palette. Mocha/Light are deferred (no token set yet). */
  readonly available: boolean;
}

/** The built-in palette set (UI-Theming §12.1). Hearth is the live default; the rest are deferred. */
export const THEME_OPTIONS: readonly ThemeOption[] = [
  {
    id: "hearth",
    name: "Hearth",
    description: "Warm charcoal with an ember accent — the default.",
    available: true,
  },
  {
    id: "mocha",
    name: "Mocha",
    description: "A cooler dark palette.",
    available: false,
  },
  {
    id: "light",
    name: "Light",
    description: "A light palette.",
    available: false,
  },
];

/** The id of the one LIVE palette today (Hearth) — the active row. A single-home constant so the picker
 *  never hard-codes the string and the "active" row can't drift from the `available` set. */
export const ACTIVE_THEME_ID = "hearth";
