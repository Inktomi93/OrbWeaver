---
kind: adr
status: active
updated: 2026-09-23
---

# The UI and UX revamp rulings

## Context

Not recorded in the ledger row.

## Decision

The UI/UX revamp rulings (region law expansion landed as `UI-Architecture-and-Layout.md` §4.2/§4.3 — the region map, per-section LIST/CONTENT/CONTEXT grid, interaction-physics rules, the ten UX rules, the ≤10% accent ration, one-Weave-per-screen):

- **P1** — pointer-conditional touch floor: ≥44px control heights at `pointer: coarse`; fine pointers get 32/34/40 (+icon 34) via a token-layer override (the fine floor was raised 28→32 after side-eye/design-audit passes; `tokens.json` documents it). The per-pointer tap-target check lives in the design-audit tool (`tooling/src/ui-audit/lib/checks-a11y.ts`; pre-#393 home: scripts/probes/design-audit-checks.ts), not the `pnpm check` battery.
- **P2** — the corrected Hearth palette: near-neutral ramp (chroma ≤0.009 @ hue 60) + Ember `oklch(0.72 0.175 52)` + deeper sidebar, in `tokens.json`.
- **P3** — mobile = BOTTOM tab bar (Chats · Characters · Corpus · You).
- **P4** — landing discriminant: the active-chat store has `{kind:"landing"}`; the app never opens on an empty room; every new-chat path goes through the character picker (characterless = an explicit "Blank chat" pick).
- **P5** — Button `secondary` is bordered; there is NO `outline` intent; `ghost` defaults muted.
- **P6** — the rail is grouped (Chats · Characters · Corpus | World Info · Presets · Refinery | Analytics). **AMENDED by D121: the rail is EIGHT sections — `home` leads on the brand cell — and the ceiling is a rule about KIND, not a count** (a rail section owns a top-level workspace with its own LIST/CONTENT/CONTEXT grid; dialogs, preferences, and one-shots go to modals/settings). The seven-section count and the "seven is the ceiling" sentence are DEAD; `SECTION_IDS` is the truth.
- Placement rulings: first-run persona ask lives in the landing hero (no dialog); Workloads UI in Settings→APP→System; micro-caps voice = `Text` micro+caps (no SectionLabel primitive); weave-glyph lives in `client/src/lib/` (cross-feature, not app-shell, not @orb/ui — but a brand GLYPH minted through the ui icon seal, e.g. `WebSpinner`'s `OrbWeb`/`OrbWebCompact` via `createLucideIcon`, is not this case: it is a curated icon, not a client-owned composite); settings is a full-bleed overlay (USER: Account · Personas · Appearance · Chat behavior / APP: Connections · Automation · System · Admin); generation/preset config is NOT settings — it is the Presets SECTION, with per-chat deviations in chat CONTEXT Overrides; the shipped theme set is Hearth · Mocha · Light (never the seed mockup's Catppuccin/Loom names).
- **The no-CI enforcement ruling:** orbweaver runs no CI — golden/CT-sweep-only gates are dead weight; `pnpm check` + the CT suite + live side-eye verification carry that ground. NOT a deferral; do not re-flag goldens as "to build."

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
