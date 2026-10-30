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

- Built: a bottom Drawer takes its inset from `--drawer-bottom-inset` (`packages/ui/src/primitives/drawer/variants.ts`: viewport and backdrop stop short of the floor, the popup is positioned against the viewport). The phone shell sets it on `.shell-portal-root` in `mobile.css` from `--dimension-rail` plus the device inset, and the room screen (no tab bar) resets it to 0. No new literal was added: the tab bar height is the existing `dimension.rail` token.
- The You tab toggles the sheet (`rail.tsx`). The modal host opens the bottom drawer with `modal="trap-focus"` so the page behind stays hit-testable and the visible tab takes the second tap. `DrawerTapGuard` is deleted from `drawer.tsx`, `index.ts`, `you-sheet.tsx` and `owner-css-surface.ts` (`renames.ts` records the removed slot).
- Red then green: `tests/client/features/app-shell/surfaces/app-shell-responsive.ct.tsx` "it ends above the tab bar" was red on the old tree (the tab was hidden behind the sheet and the scrim) and is green: on a coarse phone no sheet row sits under the tab hit box (the sheet bottom is at or above the tab top, and all four corners and the centre of the tab hit-test to the tab), and the second tap closes the sheet and returns focus to the tab. The drawer, modals, command and topbar CTs stay green.
- Open: the side-eye over every phone modal is scheduled by the coordinator.
- Side-eye follow-up (F1), red then green in `app-shell-responsive.ct.tsx`: a tap on another bar tab while the You sheet is open closes the sheet first (`rail.tsx`), then navigates, and focus ends outside the modal layer.
