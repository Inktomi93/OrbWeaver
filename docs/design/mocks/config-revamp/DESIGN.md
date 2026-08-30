---
kind: design
status: active
updated: 2026-08-30
---

# Config revamp — the S3/S4 canvas (owner-approved 2026-08-30)

> Canvas artifact: `https://claude.ai/code/artifact/c612c440-ebb8-4107-a2db-eb3d4c0f245d` (v: quick-switch-scope).
> Source of record: the `*.dc.html` + `canvas.json` beside this file. PNG exports pending (the artifact
> exports per-board PNGs; a committed render set follows — the boards above are the visual truth).
> Program: #866 (S1+S2 BUILT at `6923f33cb`; this canvas specs S3's teacher posture and S4).

## The contracts, per board

**`Main.dc.html` — Settings · Appearance, the Looks fold (#297/#227).** The LIST paints the SHIPPED
shelves (User · App · Collections · Extensions — the S1 registry, 13 groups; never "You" on desktop)
with Settings' scroll-spy; the spy sits on Looks. The content pane is APPLY-NOT-MODE (#297 verbatim:
"appearance choices are applied states, not modes you enter"), three tiers by frequency:

1. **PICK** — the three shipped themes (Hearth · Mocha · Light) as FIXED cards, "Shipped · picking
   applies it". A closed set: this row never grows.
2. **MANAGE** — "Your themes": imported + builder-made looks as LIST rows (swatch strip · name ·
   provenance+age · ⋯ menu: Apply · Edit in builder · Export · Delete). Scales to any count;
   searchable via the S2 index.
3. **MAKE** — ONE builder door at the foot: "New theme from <current>…". Every color decision lives in
   the builder and SAVES AS A NAMED THEME of the user's. **There is NO freestanding accent knob** —
   a color tweak must mint a named theme, never silently fork the picked one (owner critique
   2026-08-30). Snap's `--appearance-preset` arms are INSTRUMENT-ONLY (`tooling/_shared/appearance.ts`,
   zero product references) — the product never grows a preset switcher.
   The Density/Motion/Reading knobs sit behind the explicit **"Customize this look — advanced"** arm
   (drawn expanded; collapsed by default). The context pane teaches theme-not-mode.

**`Personas.dc.html` — Settings · Personas, the FULL surface.** List (with playing-as / pinned pills),
the editor (name · description · pinned-anchor toggle · world books), the this-chat override. Owner
ruling 2026-08-30: the whole persona surface migrates — "the only sacred thing is the MECHANICS of how
active persona and pinned persona resolve between areas" (D122; `persona-resolution.suite.int.test.ts`
byte-untouched stays the phase gate). The context hint states that frozen mechanic.

**`RailSwitcher.dc.html` — the rail-foot persona slot.** Who-you-are head → Switch persona list →
the CONTEXTUAL block for the open room ("In <chat>": an **Applies** scope segment
`Everywhere | This chat`, and the **re-attribute** action — "Re-attribute your N messages here → <persona>")
→ Manage-in-Settings link → account foot (handle · IdP · Log out). Frequency law (owner 2026-08-30):
the popover carries only what travels with a switch; create/edit/import stay in Settings. Click
budgets: switch = 2 · switch-for-this-chat = 3 · switch+re-attribute = 3. The Settings gear sits at
the rail foot above the avatar (S1's `rail.end` section); the old mid-rail cube is gone.

**`Phone.dc.html` — the You sheet, KEPT.** Identity head · Switch persona · Go to · account foot;
labels updated (Settings; User shelf; Jobs; Backup & Restore). The sheet keeps its name and shape.

## Coupled sites / hazards for the build lane

The pin/active RESOLUTION mechanics are the one frozen thing (never the UI). The theme pipeline is
D71/D44 (`UI-Theming-and-Content.md` §12) — Looks apply through it; imported themes are user data.
`reattributePersona` semantics are chat-domain; the popover only invokes the verb. The S2 search and
D120 contribution seams are the S1 registry's — everything here renders through `config-group`
contributions, no new nav machinery.
