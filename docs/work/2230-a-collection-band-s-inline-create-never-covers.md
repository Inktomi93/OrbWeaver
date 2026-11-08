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

Ruling (owner direction, 2026-11-08): cut the census. When an unscoped band cannot fit the whole name, its census and the primary icon plus the trigger, the census truncates with an ellipsis and the name stays whole. This does not reverse 2170, whose done line pins the name whole and the primary inline, not the census; the phone topbar's census cut was already ruled in 4798065491. The full census stays in the DOM text, so a screen reader still reads it.

Cause: at 1280 with both panes docked, the whole title (172px at the widest census) plus the smallest action form (the primary's icon, with Import folded into a menu whose trigger takes another 36px) is wider than the 219px band, so the row overflowed under the title. Fix: `list-pane-header.tsx` lets an unscoped identity clip (`overflow-hidden`), keeps the name `shrink-0` and ellipsizes the census (`data-slot="list-pane-census"`). `overflow-actions.tsx` reads that identity's content width as its floor (`FLOOR_AT_CONTENT`, measured at max-content) so the actions still fold before the census gives, and re-reads the floor when a sibling's text changes (a MutationObserver on the parent, since a clipped sibling's box does not change when its census does).

CT: `tests/client/features/app-shell/surfaces/list-band-title.ct.tsx`, "the <collection> band's actions overlap neither its whole name nor its census", for all four collections at 1280 with both panes docked and the widest census. It asserts the name clears the census, the census clears the first shown action, and the name renders whole. Red before the fix (the draft of this assertion measured the title ending at 268 against the first action at 241 on Characters, and 246 against 241 on Databank; the new assertion also needs the census element, which did not exist), green after, with the existing fold and inline cases still passing.
