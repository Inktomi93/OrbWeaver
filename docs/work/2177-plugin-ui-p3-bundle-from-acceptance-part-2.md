---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: client
lane: wt/agent-acaf86636920912a1
plan: cross-surface-consistency
---

# Plugin UI P3 bundle from acceptance part 2

## What

P1: plugin card switches sit at the card edge, far off the settings track at 1440, and the On chip duplicates the switch. P2: the sidecar column header truncates the plugin name. P3: Card Atlas at rest doubles its empty state and shows a dead pager, which contradicts its earlier acceptance.

## Why

Each breaks the plugin family's composition or an accepted state.

## Done when

Each finding is fixed with a capture, or answered with a cited reason in this item's Evidence. Source: acceptance part 2 report.

## Evidence

The design-audit confirmation is the next ux-reviewer pass.

- P1 card switches and the duplicate On chip: the plugin card's enable switch moved out of the header cluster onto the settings track beside "Show ... panel in chat" (`plugin-row.tsx`), and the status badge no longer renders for the plain success state, which the switch already says. CT `show-in-chat-switch.ct.tsx` asserts one shared switch x and no "On" text. The switch-name test was run red with a static name (collision) and green with the per-plugin name; the first test was red (656px against a 230px label) before the track change.
- P2 sidecar header truncation: the plugin name in the collapsible panel header wraps instead of truncating (`plugin-surface-shell.tsx`, `wrap="word"`). CT `panel-header-name.ct.tsx`: red on main (name clipped), green after. The collapse, hide and move controls stay separate buttons; folding them into one menu is a design call and rewrites accessible names that `hide-focus.ct.tsx`, `context-panels.ct.tsx` and flank tests press by name. Default: keep.
- P3 Card Atlas at rest: not changed. The pager and the empty line are authored in the plugin's UI spec (`packages/showcase-plugins/bundles/card-atlas/main.ts`, grid `empty` and the pager row), and the plugin vocabulary has no conditional visibility (comment above the pager row). Hiding them needs a vocabulary addition (conditional visibility or a bound `empty`), which is a plugin-contract change. Fork: default is to leave the spec and file the vocabulary item.
