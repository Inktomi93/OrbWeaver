---
kind: bug
status: open
updated: 2026-11-08
priority: P1
area: ui
plan: cross-surface-consistency
---

# New chat keeps its list bounded in short landscape at enlarged text

## What

New chat at 844x390 with 200% text loses its list bound: the list grows to the full roster height and Start sits after every row, tens of thousands of pixels down. The keystroke and skeleton CTs run short landscape only at 100%.

## Why

A landscape phone at enlarged text cannot reach Start, so it cannot start a chat.

## Done when

At 844x390 and 568x320 with 200% and 300% text the list stays bounded and Start is reachable, with cells added to new-chat-picker-skeleton.ct.tsx that go red on the current tree. Source: acceptance part 1 report.

## Evidence

Cause: below 14rem of dialog height (200% and 300% text on a landscape phone) globals.css lets New chat's popup scroll as one sheet, so nothing bounded the picker and its list ran the whole library: 3344px at 200% and 5016px at 300% on 844x390 and 568x320, with Start after every row. Red first: tests/client/features/app-shell/surfaces/new-chat-picker-skeleton.ct.tsx gained 844x390 and 568x320 at 200% and 300%, with and without saved rosters, each asserting the list is no taller than the screen and Start scrolls onto it (eight red on the unmodified tree). Fix: in that step the list holds to the picker window (height.picker-window) and the loading box to the matching floor box (globals.css). Green, with the skeleton, the loaded box and the dialog within 1px. tests/client/features/app-shell/surfaces/new-chat-picker-keystroke.ct.tsx has the same four cells and keeps a whole row after the first keystroke.
