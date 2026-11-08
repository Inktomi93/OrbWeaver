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

Filled at landing: what ran and where its output is.
