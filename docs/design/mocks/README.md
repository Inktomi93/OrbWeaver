# docs/design/mocks — frozen design drawings

Design references, not product code. Nothing here is built, bundled, or served: the `.html` files are
standalone hand-drawn mocks (inline styles, raw `<svg>`, no tokens) and the `.png` files are reference
renders and screenshots the design docs cite. They moved here from the gitignored `reports/design-refs/`
because they kept getting lost behind `git add -f`.

**Excluded from biome** (`biome.json` → `files.includes: "!docs/design/mocks"`). A mock is a drawing —
a11y/button-type/lang diagnostics on it are noise, and its inline-style density is the point. The token
law, the `@orb/ui` primitive law, and the a11y gates apply to the BUILD, never to the drawing.

## What's here

| Path | What |
| - | - |
| `panel-redesign/` | the chat context-panel strip, per-tab + `all-tabs.html` (the full strip) + `DESIGN.md`. **`this-chat-overrides.html` (07-29) is NEWER and WINS over `all-tabs.html` on Settings/Injections** — the superseded panes in `all-tabs.html` carry visible banners. |
| `home-section/home.html` | the HOME section — the tile grid, the glyph-as-affordance rail, the dormant doorways, the temp-chat launcher (`../home-section-spec.md`). |
| `databank-surface/` | `library.html` (the documents library — both HOME arms, the detail, the activation body) + `attach-rack.html` (the per-chat Documents section in the This-chat tab, host vs member) (`../databank-surface-spec.md`). |
| `preset-redesign/` | the preset surface redesign — `params-deck.html` (the Params deck + its CONTEXT readout), `context-readouts.html` (all six per-view CONTEXT panels, spec §7), `prompt-rack.html` (the rack first-class — the section manager, spec §5.1), `actions-and-sections.html` (guided templates/nudges + the consolidated section editor), `list-pane.html` (the LIST projection with inline activate) (`../preset-surface-redesign.md`). |
| `config-rail/` | the Configuration workspace — `workspace.html` (the tri-pane + the host/contribution seam), `empty-states.html` (first-run · empty group · no-selection · no-context-arm), `rail-and-glyph.html` (the 9th-section glyph candidates + the rail arithmetic + the vacated settings categories), `mobile.html` (the You-sheet route + the roster + the member takeover) (`../config-rail-spec.md`). **MOCK PHASE — nothing built; presets are ABSENT by ruling.** |
| `crunchy-cluster-redesign/DESIGN.md` | the rpg state-round / tracker / wand / fork program — the spec home D111 cites. |
| `waystone/` | reference renders of the Waystone dial across time-of-day × weather × theme. |
| `osrs-fixed-interface.png`, `osrs-tabs/` | the OSRS fixed-screen interface — the source anatomy for the panel strip (`Context-Panel-Program.md` §CP-4). |
| `rpg-shell-mockup.{html,png}` · `rpg-shell-mockup-v2.{html,png}` | the CP-4 shell; v2 is the SHARPENED one, v1 is kept as the pre-sharpening record. |

Rulings that override a drawing live in `../context-panel-fidelity-findings.md` and the D-ledger
(`../../architecture/core/Core-Path-Registry.md`). **A drawing is never law** — where a mock and a
ruling disagree, the ruling wins, and the mock gets a SUPERSEDED banner rather than a deletion.
