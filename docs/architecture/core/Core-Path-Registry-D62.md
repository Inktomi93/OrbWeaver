---
kind: reference
status: active
updated: 2026-07-13
---

# Orbweaver — Path/Home Registry: D62

> Split-sibling of `Core-Laws-and-Precedents.md` §7. Decision **D62**: the UI/UX revamp program. Slimmed to standing rulings 2026-07-13 (D66 — which also AMENDS four D62-era outcomes: A1 list header band returns, A2 list New is primary, A3 message actions hide-at-rest, A4 autosave everywhere; see `Core-Path-Registry-D66.md`). Program records archived: `../history/ui-polish-punchlist.md` · `../history/ux-flow-revamp.md`.

---

- **D62** — The UI/UX revamp rulings (region law expansion landed as `UI-Architecture-and-Layout.md` §4.2/§4.3 — the region map, per-section LIST/CONTENT/CONTEXT grid, interaction-physics rules, the ten UX rules, the ≤10% accent ration, one-Weave-per-screen):
  - **P1** — pointer-conditional touch floor: ≥44px control heights at `pointer: coarse`; fine pointers get 28/34/40 (+icon 34) via a token-layer override; gate `touch-target-floor` asserts per-pointer.
  - **P2** — the corrected Hearth palette: near-neutral ramp (chroma ≤0.009 @ hue 60) + Ember `oklch(0.72 0.175 52)` + deeper sidebar, in `tokens.json`.
  - **P3** — mobile = BOTTOM tab bar (Chats · Characters · Corpus · You).
  - **P4** — landing discriminant: the active-chat store has `{kind:"landing"}`; the app never opens on an empty room; every new-chat path goes through the character picker (characterless = an explicit "Blank chat" pick).
  - **P5** — Button `secondary` is bordered; there is NO `outline` intent; `ghost` defaults muted.
  - **P6** — the rail is SEVEN sections, grouped (Chats · Characters · Corpus | World Info · Presets · Refinery | Analytics); seven is the ceiling.
  - Placement rulings: first-run persona ask lives in the landing hero (no dialog); Workloads UI in Settings→APP→System; micro-caps voice = `Text` micro+caps (no SectionLabel primitive); weave-glyph lives in `client/src/lib/` (cross-feature, not app-shell, not @orb/ui); settings is a full-bleed overlay (USER: Account · Personas · Appearance · Chat behavior / APP: Connections · Automation · System · Admin); generation/preset config is NOT settings — it is the Presets SECTION, with per-chat deviations in chat CONTEXT Overrides.
  - **The no-CI enforcement ruling:** orbweaver runs no CI — golden/CT-sweep-only gates are dead weight; `pnpm check` + the CT suite + live side-eye verification carry that ground. NOT a deferral; do not re-flag goldens as "to build."
