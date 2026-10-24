---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: client
plan: css-system
---

# The shell paint law and the owner ruling agree, and lint holds the answer

## What

`docs/law/client-architecture-lockdown.md` §4.2 gives `shell.css` "shell geometry, region paint, responsive regime, and coordinated compositor motion". An owner ruling quoted at `packages/client/src/features/app-shell/components/context-bracket.tsx:10` says "shell.css is geometry", with colour coming from theme tokens elsewhere. The shell region files carry 41 paint declarations (pane backgrounds, rail tints, hairlines, the scrim).

## Why

Two homes that disagree about who paints the frame let paint drift into whichever file a lane happens to edit.

## Done when

The owner rules which home paints the frame; the law states it once; a stylelint rule scoped to the shell region files enforces it (refusing colour-bearing properties there, or allowing only token references, per the ruling); the existing declarations conform; a planted control fails.

## Owner ruling

Pending.

## Evidence

Filled at landing: what ran and where its output is.
