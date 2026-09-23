---
kind: adr
status: active
updated: 2026-09-23
---

# the CONTEXT pane is ONE chrome, the CONTEXT BRACKET, in every room and every tabs section: HEAD band → optional STATE rail → VIEWPORT → GROUND → META rail pinned to the pane's foot — rendered by the shell, never by a section or a claimant

## Context

Not recorded in the ledger row.

## Decision

Owner-ruled on the mock `docs/design/mocks/context-bracket/`. The one composition is `features/app-shell/components/context-bracket.tsx` (+ `context-rail.tsx`, `lib/context-cell-id.ts`), hosted by `ContextTabsPanel` for every `kind:"tabs"` context; `ContextRegionHost`, the generic head `tablist "Detail"`, its `tab`/`aria-selected` model, its `aria-disabled` locked tab and shell.css `.ctx-tab-strip` are deleted. The HEAD band has one slot and three contents — the section's `header` (a room's title + members · memory · preset chips, `chat-context-band.tsx`; a character's portrait + name + chips), or a claiming region's band (the rpg Waystone, D119) — never a second head, structurally: `ContextRegionDef` is `{ id, claims, band }` and a claimant cannot reach a rail. The STATE rail renders only when a `strip:"game"` tab resolved (APPLICABILITY, amended); the META rail renders always, named by its section (`ContextTabsSpec.railLabel`, falling back to the section's rail label) with the state rail named by the strip vocabulary (`GAME_STRIP_LABEL`). Rail law, universal: each rail is a named TOOLBAR of native buttons, ONE tab stop, manual activation, `aria-current` on the cell holding the view, `region` panels named by their cell; icon + caption at every width, `minmax(max-content,1fr)` tracks that scroll rather than clip, a six-cell state rail folds 3+3 below `xs` at a fine pointer and no other rail ever folds; the kicker sits ON TOP of its cells with its hairline as the seam, prints "NAME · SELECTION" on the rail that owns the view (the selection half in the foreground ink, the name in the kicker's muted ink), and the receded rail rests on a quieter step of the same fill with a floor under its cells; the locked cell wears a padlock and OPENS onto its reason (RV-7); the active cell wears the ember fill + a 2px primary bar on its bottom edge in both rails; cells clear `control-lg` at a coarse pointer. The shell's `.shell-panel-header` renders nothing for a tabs pane in any mode (D66 A1 holds for LIST and `single`/`none`); the bracket paints the 2px content↔context binding on its own root from the primary token (shell.css owns the SHELL'S OWN structural surfaces — region fills, seams, elevation — and a COMPONENT's paint never lands there; the file carries only token-sourced colors today, not literals — commit `cfc304c05` §3) and, while the pane floats, seats the dismiss inside the band's corner. **The topbar yields the room's identity to a DOCKED context pane**: with `data-context-mode="docked"` the chats topbar sheds the title, the members chip and the recall chip (their home is the band, 300px away) and keeps the avatar cluster; a collapsed or floating pane leaves the row as it was. Gate law: `context-definition-shape` (`arms 5–8` re-keyed on `{claims, band}` and `data-context-bracket`). Provenance: HUD-1 §5.1 survives as "one META strip, always, at the FOOT"; owner decision 6 is universal. Characters seat their six-tab roster in the same chrome.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
