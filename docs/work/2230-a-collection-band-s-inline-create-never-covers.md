---
kind: bug
status: open
updated: 2026-11-08
priority: P2
area: client
plan: cross-surface-consistency
---

# A collection band's inline create never covers its census

## What

At 1280 with both side panes open, the Characters band's New character button paints over the census, so the count reads as a shorter number. fitActions in packages/client/src/components/overflow-actions.tsx keeps the primary inline without reserving the census width. The design audit does not catch it.

## Why

A count that is partly covered reads as a wrong number.

## Done when

At 1280 with both panes docked no band action overlaps the title or census on any collection, with a CT that measures the census box against the action boxes. Source: acceptance part 3 report R2.

## Evidence

Not fixed. The CT is written and red (title and census end at 268 against the first shown action at 241 on Characters, and 246 against 241 on Databank, at 1280 with both panes docked and the widest census). The cause is not a stale floor: with the census at its widest, the whole title (172px) plus the smallest action form the row can show (the primary's icon, the Import icon is folded into a menu whose trigger takes another 36px) is wider than the 219px band, so `fitActions` returns its last candidate (`visible` stops at 1) and the row overflows leftward under the title. No ordering of `fitActions` can fit it. Something has to give: the census is cut (the phone topbar's precedent, but ruling 2170 pins the unscoped name whole and its census beside it), the name is cut, or the band grows. Default: cut the census with an ellipsis for an unscoped band, name `shrink-0`, identity `min-inline-0`; not done here because it reverses part of 2170. The red CT is kept in the lane report folder, not committed.
