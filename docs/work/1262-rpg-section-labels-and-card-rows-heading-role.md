---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: rpg
---

# RPG section labels and card rows: heading role, touch height, turn reference

## What

Three pre-existing findings from the side-eye of the RPG scene card archive. Every RPG section label (`Kicker`) is a styled paragraph (`paragraph: Cards — 3`), so the sections are missing from the heading outline and the archive has no name at all in its error state. `RpgCardRow` with `size="inline"` is 34 px tall at 430 px width, under the 44 px touch target. Each card row shows the last five characters of its message id (`RpgTurnRef`), which means nothing to a first-time user. The design audit also flagged an 18 px short side on the Scene tab's quest link (`Open <quest> in Quests`) in a desktop run, unconfirmed at touch size.

## Why

Screen-reader navigation, touch targets and legible references are the baseline the UI law sets for every surface.

## Done when

`Kicker` renders as a heading for the RPG section family; the inline card row has a touch-sized height from `@orb/ui`; the turn reference shows a turn number or time; the quest link's touch size is measured and fixed if under 44 px; CTs assert the heading role and the row height at phone width.

## Evidence

Filled at landing: what ran and where its output is.
