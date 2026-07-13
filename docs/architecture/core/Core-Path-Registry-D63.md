---
kind: reference
status: active
updated: 2026-07-13
---

# Orbweaver — Path/Home Registry: D63

> Split-sibling of `Core-Laws-and-Precedents.md` §7. Slimmed to the standing ruling 2026-07-13 (D66). AMENDS D49 §3.

---

- **D63** — The app background IMAGE lives in the `appearance` user-settings namespace, NOT on the theme: the base surface COLOR (`ThemeOverride.background`) stays a theme token (it feeds the derived neutral ramp via `oklch(from background …)`); the decorative photo is FLAT appearance fields (`backgroundImageKind: none|seeded|external` · `backgroundSeededId` · `backgroundExternalUrl` (URL-validated → CSS `url()`) · `backgroundFit: cover|contain` · `backgroundDim: 0–1`) — palette-independent, discoverable beside the glass/`blurSurfaces` control it composes with. Applied ONCE at the app root (`<ThemeBackgroundLayer>` + mandatory scrim, never a `--*` var), so a nested per-speaker `<ThemeScope>` never spawns a second layer. Per-character background is out of scope (re-addable later as an override layer). The `asset` source stays deferred (no client asset-URL resolver).
