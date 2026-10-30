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

- Cause: `carryContextAcrossListFlip` returned right after naming the sheet in the auto-overlay channel, so the wide `docked` override written when the pane last left the sheet stayed. Closing the sheet then hid only the request, and the next list hide docked the pane from the stale override.
- Fix: `packages/client/src/features/app-shell/hooks/use-shell-layout.ts` writes `collapsed` to the wide channel in the same arm that names the sheet. This keeps the pane-visibility ruling in that function's comment: the carry moves what the user can see across the flip and never a hidden pane's stored preference.
- Red first: `tests/client/features/app-shell/surfaces/app-shell-panels.ct.tsx` case "a sheet closed after a list hide and show stays closed through the next list hide" fails on the old source at its last assertion (context `docked`, expected `collapsed`). Green after the fix, with the three neighbouring carry cases and the whole file (33 of 33, Chromium).
