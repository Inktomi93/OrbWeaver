---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: server
---

# Some discovery reads re-spell the character-scope predicate instead of calling its one home

## What

The discovery persistence layer has one home for the scope predicate that separates a person's real library cards from the synthetic per-room group rows, created precisely because the predicate had been hand-written in several reads and applied in only some of them. Two reads still do not call it. The distill target query hand-writes the synthetic exclusion in its owned and every-owner forms — the shared helper covers both exactly. The shared-avatar tally that powers the image-analytics exclusions filters by owner and non-null avatar only, with no synthetic exclusion; the header next to it asserts the excluded rows represent no one character, and the row that breaks that assertion is reachable: nothing at the API layer refuses to set an avatar on a synthetic row, only the user interface hides such rows. Source: reports/codebase-review/units/dom-discovery.md.

## Why

The helper exists because split predicates in split reads caused exactly this class of wrong answer. A future exclusion added inside the helper lands in the distill query by silence or by drift, never by edit; and the shared-avatar count can silently include the one kind of row its own header says is impossible.

## Done when

The distill target reads compose their scope from the shared helper, and the shared-avatar tally either composes from it too or carries in its header the argument for why synthetic rows cannot appear — one or the other, not silence.

## Evidence

Filled at landing: what ran and where its output is.
