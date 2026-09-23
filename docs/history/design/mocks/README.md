---
kind: history
status: archived
updated: 2026-08-30
---

# docs/history/design/mocks — retired design drawings

A mock set follows its spec. These sets draw specs that retired to `docs/history/design/`, so they
retired with them. Live sets stay at `../../../design/mocks/` (that dir's README indexes them and
carries the shared rules: drawings are not product code, the set is excluded from biome, and a drawing
is never law).

Frozen evidence. Nothing here is repointed when the tree moves; read a set against the spec beside it,
not against today's code.

| Path | Spec it draws |
| - | - |
| `panel-redesign/` | the chat context-panel strip, per-tab + `all-tabs.html` + its own `DESIGN.md`. **`this-chat-overrides.html` is NEWER and WINS over `all-tabs.html` on Settings/Injections** — the superseded panes carry visible banners. Rulings that override it: `../context-panel-fidelity-findings.md` |
| `home-section/home.html` | `../home-section-spec.md` — the tile grid, the glyph-as-affordance rail, the dormant doorways, the temp-chat launcher |
| `preset-redesign/` | `../preset-surface-redesign.md` — `params-deck.html` (§ the Params deck + CONTEXT readout), `context-readouts.html` (the six per-view panels, §7), `prompt-rack.html` (§5.1), `actions-and-sections.html`, `list-pane.html` |
| `list-pane-projection/` | `../list-pane-projection-proposal.md` — `character-launcher.html`, `unified-rail.html` |
| `refinery/` | `../refinery-r0.md` and the R3 plan — `surface.html` (the LIST·CONTENT·CONTEXT shell), `apply-and-selection.html`, `empty-states.html`, `d62-deltas.html` |
| `login-loading/` | `../login-loading-screen.md` §9 (BUILT) — `login-loading-mock.html` (every scene/mode/theme/reduced-motion arm) + the brand-A winners `orb-mark-a.svg` / `orb-favicon-a.svg`, whose 16px cut is the shipped `packages/client/public/favicon.svg` |
| `crunchy-cluster-redesign/DESIGN.md` | itself — the rpg state-round / tracker / wand / fork program. The spec home D111 cites (`../../../adr/0111-the-rpg-state-round-reads-the-story-the.md`) |
