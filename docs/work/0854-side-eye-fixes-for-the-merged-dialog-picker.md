---
kind: bug
status: doing
updated: 2026-10-11
priority: P2
area: client
lane: wt/agent-a50c8fe8ec6014e51
---

# Side-eye fixes for the merged dialog, picker and inspector work

## What

Side-eye on main (review in ~/Archives/orbweaver-reviews/merged-ui-oct10.md): the glass dialog footer reads as a separate slab and leaves scrolled text unblurred; the phone inline name field squeezes the collection filter; the model picker scrolls the settings pane instead of its list; the connection inspector's HTTP-error verdict repeats the status and blames the reply; the wire viewer shows {} for replies recorded before params were stored.

## Why

User-visible regressions on surfaces merged today.

## Done when

Each finding is fixed with a CT: footer surface matches the glass popup and hides what scrolls under it; the name form takes its own row at narrow widths; only the picker list scrolls and lands on the pick; distinct verdicts for non-2xx and unreadable 2xx; an empty params record reads as not recorded.

## Evidence

Filled at landing: what ran and where its output is.
