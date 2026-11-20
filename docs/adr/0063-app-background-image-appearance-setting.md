---
kind: adr
status: active
updated: 2026-09-23
---

# The app background image is an appearance setting

## Context

Not recorded in the ledger row.

## Decision

The app background IMAGE lives in the `appearance` user-settings namespace, NOT on the theme: the base surface COLOR (`ThemeOverride.background`) stays a theme token (it feeds the derived neutral ramp via `oklch(from background …)`); the decorative photo is FLAT appearance fields (`backgroundImageKind: none|seeded|external` · `backgroundSeededId` · `backgroundExternalUrl` (URL-validated → CSS `url()`) · `backgroundFit: cover|contain`; the scrim is not a setting but the constant `BACKGROUND_SCRIM_DIM` in `packages/contracts/src/settings/appearance.ts`, derived from the contrast floor under a D144 rider) — palette-independent, discoverable beside the glass/`blurSurfaces` control it composes with. Applied ONCE at the app root (`<ThemeBackgroundLayer>` + mandatory scrim, never a `--*` var), so a nested per-speaker `<ThemeScope>` never spawns a second layer. Per-character background is out of scope (re-addable later as an override layer). The `asset` source stays deferred (no client asset-URL resolver).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
