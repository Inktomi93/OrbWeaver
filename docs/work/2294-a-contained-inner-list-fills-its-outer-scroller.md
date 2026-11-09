---
kind: bug
status: open
updated: 2026-11-09
priority: P2
area: ui
plan: surface-walk
---

# A contained inner list fills its outer scroller at enlarged text, so the wheel cannot scroll the outer region

## What

When an inner list with overscroll-behavior contain covers the whole visible port of the region around it, every wheel stays in the inner list. Seen in the Members Add a character popover and the Refinery command list (command-list), the Corpus finder and the Characters library (virtual-list-scroll), and the Presets and Refinery libraries (library-list-scroll), at 300% text on the 1440 desktop and the phone.

## Why

The rest of the outer region, such as a popover foot or the bands above a list, cannot be reached with the wheel.

## Done when

Each named region scrolls with the wheel at 300% text from some visible point, and the surface walk's wheel aim finds a point in each on desktop-1440-all-panes-text300 and chromium-phone-portrait-text300.

## Evidence

Filled at landing: what ran and where its output is.
