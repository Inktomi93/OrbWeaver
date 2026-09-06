---
kind: design
status: archived
updated: 2026-09-05
---

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
| `databank-surface/` | `library.html` (the documents library — both HOME arms, the detail, the activation body) + `attach-rack.html` (the per-chat Documents section in the This-chat tab, host vs member) (`../databank-surface-spec.md`). |
| `config-rail/` | the Configuration workspace — `workspace.html` (the tri-pane + the host/contribution seam), `empty-states.html` (first-run · empty group · no-selection · no-context-arm), `rail-and-glyph.html` (the 9th-section glyph candidates + the rail arithmetic + the vacated settings categories), `mobile.html` (the You-sheet route + the roster + the member takeover) (`../config-rail-spec.md`). **MOCK PHASE — nothing built; presets are ABSENT by ruling.** |
| `osrs-fixed-interface.png` | the OSRS fixed-screen interface — the source anatomy for the panel strip, embedded by `../../architecture/Context-Panel-Program.md` §CP-4. |
| `characters-landing/` | the Characters CONTENT landing (#864, owner-ruled 2026-08-30) — `build.mjs` → four `*.dc.html` artboards + `canvas.json` (the Claude Design canvas source) + true-size `*.png` renders (docked · list collapsed · fresh install · phone); `DESIGN.md` carries the ruling, the material table and the fences. |
| `context-bracket/` | the context panel as ONE head+foot chrome for chats, game rooms and characters (#860, owner-ruled 2026-08-30) — `build.mjs` → seven `*.dc.html` artboards + `canvas.json` (the Claude Design canvas source) + true-size default-state `*.png` renders; `DESIGN.md` carries the ruling, the slot table and the coupled sites. |
| `config-collections/` | the config COLLECTIONS moved out of the LIST pane into CONTENT (#1725, owner-approved 2026-09-05 "redesign approved it can be built to spec but must match the mockups") — `build.mjs` → `canvas.html` (eleven boards from ONE renderer, Hearth + a Light toggle) + true-size `renders/*.{hearth,light}.png` (7 desktop at 1440×900, 4 phone at 430×860); `DESIGN.md` is the SPEC the build must match, and `REVIEW-stickler.md` / `REVIEW-sideeye.md` are the two v1–v2 reviews whose P0/P1s v3 answers. |
| `rpg-shell-mockup.{html,png}` · `rpg-shell-mockup-v2.html` | the CP-4 shell; v2 is the SHARPENED one, v1 is kept as the pre-sharpening record (its `.png` is the one `Context-Panel-Program.md` embeds). |
| `regex-section/` | the room's Regex section (#1742, owner-ruled 2026-09-05 "regex approved" on v2) — `build.mjs` → `canvas.html` (five boards: host open · host after two flips · member · phone · phone attach sheet) + true-size default-state `renders/*.png` in both themes; `DESIGN.md` is the spec, `STUDY.md` the SillyTavern fact base, `PROPOSAL-{ia,ux,sys}.md` the three lenses, `REVIEW-{sideeye,stickler}.md` the v1 reviews whose findings §7 folds. |

**A mock set follows its spec.** When the spec a set draws retires to `docs/history/design/`, the set
retires with it — the retired sets live at `../../history/design/mocks/` and are indexed by that dir's
own README.

**Renders are kept only while something cites them (2026-08-30 retirement pass, issue #872).** The
uncited render sets — `osrs-tabs/` (12 PNG, 9.8 MB), `waystone/` (35 PNG) and `rpg-shell-mockup-v2.png`
— were removed; git history holds them. A set whose sources are `.html`/`.mjs` keeps its sources
regardless: those are the drawing, not a snapshot of it.

Rulings that override a drawing live in `../../history/design/context-panel-fidelity-findings.md` and the D-ledger
(`../../architecture/core/Core-Path-Registry.md`). **A drawing is never law** — where a mock and a
ruling disagree, the ruling wins, and the mock gets a SUPERSEDED banner rather than a deletion.
\| [config-revamp](config-revamp/) | #866 S3/S4 — Settings shelves · the Looks fold (apply-not-mode) · full Personas migration · the rail-foot switcher with scope+re-attribute | `docs/design/config-revamp-design.md` |
