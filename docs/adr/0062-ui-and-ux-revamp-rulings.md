---
kind: adr
status: active
updated: 2026-10-30
---

# The UI and UX revamp rulings

## Context

Not recorded in the ledger row.

## Decision

The UI/UX revamp rulings (region law expansion landed as `UI-Architecture-and-Layout.md` §4.2/§4.3 — the region map, per-section LIST/CONTENT/CONTEXT grid, interaction-physics rules, the ten UX rules, the ≤10% accent ration, one-Weave-per-screen):

- **P1** — pointer-conditional touch floor: ≥44px control heights at `pointer: coarse`; fine pointers get 32/36/40 (+icon 36) via a token-layer override; `tokens.json` documents it. The per-pointer tap-target check lives in the design-audit tool (`tooling/src/ui-audit/lib/checks-a11y.ts`), not the `pnpm check` battery.
- **P2** — the corrected Hearth palette: near-neutral ramp (chroma ≤0.009 @ hue 60) + Ember `oklch(0.72 0.175 52)` + deeper sidebar, in `tokens.json`.
- **P3** — mobile = BOTTOM tab bar (Chats · Characters · Corpus · You).
- **P4** — landing discriminant: the active-chat store has `{kind:"landing"}`; the app never opens on an empty room; every new-chat path goes through the character picker (characterless = an explicit "Blank chat" pick).
- **P5** — amended by [D336](0336-tone-roles-and-one-variant-vocabulary.md), which owns the Button fill styles.
- **P6** — the rail is grouped (Chats · Characters · Corpus | World Info · Presets · Refinery | Analytics). **AMENDED by D121: the rail is EIGHT sections — `home` leads on the brand cell — and the ceiling is a rule about KIND, not a count** (a rail section owns a top-level workspace with its own LIST/CONTENT/CONTEXT grid; dialogs, preferences, and one-shots go to modals/settings). The seven-section count and the "seven is the ceiling" sentence are DEAD; `SECTION_IDS` is the truth.
- Placement rulings: first-run persona ask lives in the landing hero (no dialog); Workloads UI in Settings→APP→System; micro-caps voice = `Text` micro+caps (no SectionLabel primitive); `WeaveGlyph` lives in `@orb/ui` beside `WebWeave` and `WebSpinner` (`packages/ui/src/art/web-weave/weave-glyph.tsx`, door `@orb/ui/web-weave`), because the route pending mark, the login shell and feature empty states all render it; settings is a full-bleed overlay (USER: Account · Personas · Appearance · Chat behavior / APP: Connections · Automation · System · Admin); generation/preset config is NOT settings — it is the Presets SECTION, with per-chat deviations in chat CONTEXT Overrides; the shipped theme set is Hearth · Mocha · Light (never the seed mockup's Catppuccin/Loom names).
- **No golden screenshot gates:** CI runs the native application checks and is the verdict (D317); screenshot baselines and CT-sweep-only gates stay out.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
