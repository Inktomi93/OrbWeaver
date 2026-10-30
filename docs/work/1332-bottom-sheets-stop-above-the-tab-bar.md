---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: ui
---

# Bottom sheets opened from the tab bar stop above it

## What

The You sheet's last row sits where the finger just tapped the You tab, so a double tap fires it; the current guard is a spacer (`DrawerTapGuard`) that costs the sheet the tab bar's height.

Order: build after item 1421 step 1 merges. It needs the Drawer bottom presentation and a phone-shell inset token, both in that lane's files.

## Why

The opening gesture must not activate a sheet row under the tab's touch target.

## Owner ruling

A bottom sheet opened from the tab bar ends above the bar; the bar stays visible and tapping its tab again closes the sheet.

## Done when

The Drawer primitive's bottom presentation takes the tab-bar inset from a token on the phone shell, the You tab toggles the sheet, `DrawerTapGuard` is deleted, a coarse-pointer CT proves no row sits under the tab's hit box and the second tap closes, and a side-eye pass covers every phone modal.

## Evidence

- Not started: the done line needs the Drawer primitive's bottom presentation and a phone-shell token, plus deleting `DrawerTapGuard` from `packages/ui/src/primitives/drawer/drawer.tsx` and `index.ts` and its slot name from `packages/client/owner-css-surface.ts`. The primitives and tokens trees belong to the tone-role lane. The client half (the You tab toggling the sheet in `rail.tsx` and `you-sheet.tsx`) has no meaning without the inset token.
