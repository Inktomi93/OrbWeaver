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

## Why

The opening gesture must not activate a sheet row under the tab's touch target.

## Owner ruling

A bottom sheet opened from the tab bar ends above the bar; the bar stays visible and tapping its tab again closes the sheet.

## Done when

The Drawer primitive's bottom presentation takes the tab-bar inset from a token on the phone shell, the You tab toggles the sheet, `DrawerTapGuard` is deleted, a coarse-pointer CT proves no row sits under the tab's hit box and the second tap closes, and a side-eye pass covers every phone modal.

## Evidence

Filled at landing: what ran and where its output is.
