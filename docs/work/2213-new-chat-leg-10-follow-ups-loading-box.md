---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: client
plan: cross-surface-consistency
---

# New chat leg 10 follow-ups: loading box off on short desktops, keystroke cells that do not guard, a stale header

## What

The leg 10 review found three small gaps. The picker loading box is sized for landscape phones and is off in short desktop windows, by 2px at 1440x560 and 300% and by 62px with rosters at 1920x480 and 200%, so Start shifts inside the sheet when the list loads. The four new landscape cells in new-chat-picker-keystroke.ct.tsx stay green with the list bound removed, so they do not guard 2179. The header comment of new-chat-picker-surface.tsx still says a stacked dialog puts Blank chat below the footer.

## Why

A loading box that differs from the loaded list moves the controls the user is about to tap, and a case that cannot fail guards nothing.

## Done when

The loading box matches the loaded list in short desktop windows with and without rosters, the keystroke cells go red with the list bound removed, and the header comment matches the code.

## Evidence

Fixed. The tiny-dialog rule in `packages/client/src/styles/globals.css` now replaces the picker-box token on a declared loading box instead of fixing its length, so the declared door row stays in it, and the list's bottom hairline is added only on a landscape phone, where the list has it. The picker reserve (`Stack reserve="gives"`) sizes the door row as it renders: no block inset in a short dialog, no row where it is hidden. `tests/client/features/app-shell/surfaces/new-chat-picker-skeleton.ct.tsx` gains 1440x560 at 300% and 1920x480 at 200%, each with and without rosters: red on the base source (2px, 2px, 2px and 62px), green after.

The keystroke cells now assert the list stays a window (no taller than the screen). With the list bound planted out of globals.css the four landscape cells at 844x390 and 568x320 (200% and 300%) went red (2432px and 3648px lists) and every other cell stayed green.

The header comment of `packages/client/src/features/chat/surfaces/new-chat-picker-surface.tsx` now states the room rule.
