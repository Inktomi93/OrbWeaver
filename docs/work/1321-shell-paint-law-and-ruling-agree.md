---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: client
plan: css-system
---

# The shell paints only its own regions, and lint holds that line

## What

`docs/law/client-architecture-lockdown.md` §4.2 gives `shell.css` "shell geometry, region paint, responsive regime, and coordinated compositor motion". An owner ruling quoted at `packages/client/src/features/app-shell/components/context-bracket.tsx:10` says "shell.css is geometry", with colour coming from theme tokens elsewhere. The shell region files carry 41 paint declarations (pane backgrounds, rail tints, hairlines, the scrim).

## Why

Two homes that disagree about who paints the frame let paint drift into whichever file a lane happens to edit.

## Decision

D150 already rules it (ADRs outrank the UI law): `shell.css` owns the shell's own structural surfaces — region fills, seams, elevation — from tokens only, and a component's paint never lands there. The `context-bracket.tsx:10` phrase "shell.css is geometry" is a narrower note about the bracket's ember edge; reword it to match D150. The shell files still break D150: `shell/grid.css` styles `[data-slot="message-bubble"]`, `[data-slot="composer"]` and skins `[data-slot="empty-state-root"]` (padding, radius, fill, blur).

## Done when

A stylelint rule scoped to the shell region files allows colour only as a semantic token reference (or a relative/`color-mix` colour over one) and refuses any selector that targets a component (`[data-slot]` values the shell does not own, or `@orb/ui` classes); the component rules in `grid.css` move to their components' variants or the client styles home; `@scope` with a lower boundary at component roots is evaluated as the mechanism, if the browser targets support it; the lockdown §4.2 row cites D150 instead of restating it; planted controls fail.

## Evidence

Filled at landing: what ran and where its output is.
