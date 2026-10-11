---
kind: bug
status: doing
updated: 2026-10-10
priority: P2
area: client
lane: wt/agent-af33eeddd3db84319
---

# Message swipes show only their position

## What

Owner ruling: the variant label beside the swipe control is noise; show only the swipe numbers (for example 2/5).

## Why

Owner ruling. Owner ruling.

## Done when

The swipe control shows its position count only, on desktop and mobile; coupled CT updated.

## Evidence

Owner ruling: inline swipe like SillyTavern. Chevrons sit on the message edges with a small position count at the foot, with no VARIANT label and no separate pager row, on phones.

Later owner rulings: the swipe foot is designed per style as a pair with the sticky header, older swiped messages show the count only, the foot never widens a short bubble, and there is no dead space under it. Each style gets one sticky header bar holding name, time and the message actions (no separate actions row), using the row's own surface, never cutting a text line, one compact height across styles.
