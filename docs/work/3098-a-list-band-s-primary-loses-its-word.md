---
kind: work
status: open
updated: 2026-11-15
priority: P2
area: ui
---

# A list band's primary loses its word at the 272px list whenever the band has a second action

## What

At a 1280 pixel wide window the list pane is 272px and the band's action cell has 74px (band 271px, 40px start inset and 12px end inset, title 137px, census slot 16px). New's word measures 74px alone and the More trigger 36px, so OverflowActions (packages/client/src/components/overflow-actions.tsx, fitActions) cannot seat the worded primary beside the trigger or a second action, and shows New as its icon form on every band that has a second action. At 200 percent text the room is 148px against 147px for the word and 72px for the trigger: the same result.

## Why

The band is the section's front door and its primary loses its word at the commonest desktop width. The title cell takes 137px of 219px even when the census is cut.

## Done when

The band at the 272px list seats the primary with its word beside one icon action, by giving the cell its room back (a narrower start inset, a census that gives its slot up when cut, or a title that shrinks) or by a ruling that the primary stays an icon there. A shell CT pins the chosen width case for the Presets, Characters and Chats bands.

## Evidence

Filled at landing: what ran and where its output is.
