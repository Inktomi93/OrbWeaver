---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: client
---

# Context carry resurrects a closed sheet

## What

On a constrained Chats screen: open the details pane, hide the list, show it, close the sheet, hide the list again, and the context pane docks. `carryContextAcrossListFlip` in `packages/client/src/features/app-shell/hooks/use-shell-layout.ts` returns before releasing the wide channel's `docked` override, so a closed sheet's mode survives the flip.

## Why

A pane the user closed reopens without being asked.

## Done when

A CT reproduces the sequence red-first and passes after the fix; the fix states how it holds the existing pane-visibility ruling it touches.

## Evidence

Filled at landing: what ran and where its output is.
