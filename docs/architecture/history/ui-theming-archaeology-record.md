---
kind: history
status: superseded
updated: 2026-07-13
---

# UI theming archaeology record

> **FROZEN 2026-07-13.** Extracted from `core/UI-Theming-and-Content.md` during the de-archaeology pass.
> The LIVE law — the two trust tiers, the token-override API, the sandbox/media model, the emit surface —
> lives there (§12) and in `proposed/ui-cohesion-north-star.md` §2b/§2c/§8 (the code-verified theming
> pipeline). This file is provenance only: the SillyTavern reverse-engineering that sized the safe subset,
> the Shadow-DOM-vs-iframe research that picked the boundary, and the journey by which the derived-ramp
> emit surface grew. Nothing here is law. Git history is the deeper archaeology.

## Why the theming/content model was specced early (pre-chat)

SillyTavern's expressive surface — custom CSS (global + per-character), rich HTML "cards", inline images —
is a real product need, redesigned to orbweaver rigor. The chat message-content model, composer, and
assembly all *depend* on those decisions; left unspecced, the chat phase would have reinvented them ad hoc
(and copied ST's bypassable regex-sanitize approach). The `@orb/contracts` blocks (`ThemeOverride`,
`MessageContentBlock`) and the `@orb/ui` primitives were therefore built born-compliant, before chat
assembled any content. This is why a section this large predates the feature it governs.

## SillyTavern prior-art reverse-engineering (what sized the safe subset)

ST is prior art to learn from, not copy. The findings that shaped §12:

- **ST scopes untrusted CSS by string-munging, which is bypassable** (verified from ST source): `.custom-`
  class renaming + `://` stripping. This is why orbweaver isolates untrusted content by a *browser-enforced
  boundary* (sandboxed iframe · CSP · token-validation), NEVER by regex-sanitize-and-scope.
- **The safe token subset was sized to ST parity**, verified against ST's `--SmartTheme*` vars: accent,
  per-role bubbles, name color, the RP prose semantics (dialogue/narration/body), font, radius, background
  surface color, chatStyle + density/avatar toggles. This covers \~90% of per-character styling with zero
  injection surface.
- **"A card generated an inline music player"** was verified from ST source as raw HTML carrying a native
  `<audio controls>` — interactive with ZERO card JS. This is why native `<audio>`/`<video controls>` is
  the one HTML class allowed to be declaratively interactive under the no-JS rule (§12.3), sidestepping the
  Tier-B `allow-scripts` requirement.

## Why Tier B is a sandboxed iframe, not Shadow DOM (2026-06 research)

Settled by research: **Shadow DOM is *composability*, not isolation** — JS in a shadow tree has full page
access, custom props pierce it, and there was a 2026 CSS sandbox-escape CVE. A **sandboxed `<iframe>` is a
separate realm** (the decade-proven primitive for untrusted rendered HTML/CSS/JS: Claude Artifacts,
CodePen, JSFiddle). No all-in-one library does parse+sanitize+isolate — and none is needed: sanitize is
NATIVE in Streamdown (its bundled `rehype-sanitize`+`rehype-harden`, NOT DOMPurify, which would be a
redundant second pass outside the pipeline), plus the small OWNED `sandbox-frame` (we own the exact
`sandbox`/CSP attributes; the iframe IS the boundary — don't depend on a generic lib for the security
boundary). `react-shadow` exists but is for own-design-system encapsulation, the wrong tool for untrusted
content.

## How the derived-ramp emit surface grew past the strict ST subset

The Tier-A clamp derives the whole chrome from ONE user-picked `background` (browser relative-color-syntax,
never hand-picked values). The emit surface deliberately WIDENED past the strict ST subset — each widening
was scoped to "chrome whose absence left a visible unthemed edge/field/text on a themed panel", found by
side-eye passes:

- **The sidebar-border + search-chip + muted-placeholder findings** — a recolored panel kept an unthemed
  hairline/field/placeholder edge; `border`, `sidebar-border`, `input`, and the softer `muted-foreground`
  were added as polarity-correct derived tones.
- **The accent trio (2026-07-09)** — a selected row under a light custom theme kept the pinned dark Hearth
  accent slab (quick-pick illegibility, P2); `accent`/`accent-foreground` + `primary-foreground` were added
  so a dark accent pick can't keep a light static foreground and vanish.
- **The chrome-theming GAP (2026-07-09)** — a custom theme recolored the rail but its hover and the
  `bg-secondary`/`bg-muted` chips stayed pinned Hearth; `sidebar-accent` (ΔL +0.077), `secondary`/`muted`
  (ΔL +0.097) + `secondary-foreground` were derived to close it.

The authoritative live emit surface is now `THEME_SCOPE_EMIT_VARS` in
`packages/ui/src/content/theme-scope/clamp.ts` (drift-gated), not this narrative — see §12.1 for the live
law and `proposed/ui-cohesion-north-star.md` §2c for the code-verified invariants.

## Cuts

- **The seed's Loom "work mode"** (a structural theme mode) was CUT — a theme is purely a token value-set
  (a color palette + optional density), never a structural mode.
- **`movingUI` (free-form dragging) and `waifuMode` (VN-fullscreen)** were cut (VN cut, D49).
- **The seed mockup's palette names** (Catppuccin / Loom) were never shipped — the theme set is
  Hearth · Mocha · Light (D62).
