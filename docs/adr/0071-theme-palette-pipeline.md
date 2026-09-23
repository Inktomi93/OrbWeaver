---
kind: adr
status: active
updated: 2026-09-23
---

# The theme palette pipeline

## Context

Not recorded in the ledger row.

## Decision

**The theme-palette pipeline: generated seed value-sets + polarity-aware intent tokens.** Four standing rulings, one pipeline. (1) **Seed palettes are DTCG value-sets, never hand CSS:** Mocha/Light live as `ui/src/tokens/themes/*.json` and `tokens.build.ts` generates their `[data-theme]` blocks into `theme.css` (Hearth IS the base `@theme`); the build validates each set to EXACTLY the `THEME_SCOPE_EMIT_VARS` colors + `color.backdrop` (was `color.scrim` until the D144 retirement), oklch-only — a hand-authored `[data-theme]` block reappearing in `globals.css` is RED (`tests/ui/styles/css-structure.suite.test.ts`), staleness is RED (the `tests/ui/tokens/index.test.ts` freshness gate). **Truth-repaired (found by cb-token-controls while minting D159's `input-border`): clause (1)'s validated set is EXACT plus ONE carve-out, not exact.** `loadSeedThemes` (`packages/ui/tokens.build.ts:437-462`) additionally permits a LIGHT-case seed extra for any base token whose `outputRole` is `light-dark` (the `extra` computation at `tokens.build.ts:445-447` excludes `theme.source === "light" && baseByPath.get(path)?.outputRole === "light-dark"` from the violation set) — these are the Light polarity cases consumed by `light-dark()` composition, not `[data-theme]` overrides in their own right. This is how `--color-selection-quiet` has carried a `themes/light.json` row and how `--color-input-border` (D159) does now; clause (3)'s intent-token enumeration stays complete because neither is an intent color. (2) **A seed theme RENDERS from its block only:** app-shell passes an EMPTY override to `ThemeScope` for `isSeed` (`client/src/lib/resolve-theme-scope-tokens.ts` + its test) — the seed row's `ThemeOverride` is solely the duplicate-to-customize template, pinned byte-identical to the ui authority by `tests/server/domain/settings/seed-theme-pairing.suite.test.ts` (per-field + registry set-equality both ways; Hearth exempt as base). Passing a seed override through the clamp re-derives and SHADOWS the hand-tuned block (chroma-0 foregrounds, bright system-bubble fg, density stomping the appearance pref) — the bug this ruling closes. (3) **Intent colors (destructive/success/warning/info/highlight ± foregrounds) are ONE static token with `light-dark()` cases** — never re-authored per theme (the token-classification partition stands); the dark case is the legacy value, the light case is AA-tuned; `tests/ui/content/theme-scope/palette-contrast.suite.test.ts` sweeps EVERY value-set (derived from the generated `SEED_THEME_VALUE_SETS`, so a new theme json is auto-covered) at the 4.5:1 text + pill floors per polarity. A future intent token (e.g. PP1's `info-foreground`) ships as a light-dark pair. (4) **The clamp derives `color-scheme` from the picked `background`'s measured polarity via `surfacePolarity`** (a `ClampedTheme` struct axis, NOT an emitted var; non-oklch bases fail open; supersedes the raw-L pivot compare, ADR 0202) so user-authored themes resolve the correct case and native controls — scheme polarity and the foreground flip share the ONE measurement and can never disagree. Minted under this ruling: `motion.breathe` (hero shimmer period) and `blur.saturate` (glass saturation — every `backdrop-filter` saturation is token-gated).

Split off for the 8 KiB ADR cap: shadow-ingredient derivation [ADR 0200](0200-theme-shadow-ingredient-derivation.md), the neutral surface ramp [ADR 0201](0201-theme-surface-ramp-two-case-derivation.md), and the accepted-base foreground contract that supersedes clause (4) [ADR 0202](0202-theme-accepted-base-foreground-contract.md).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
