---
kind: bug
status: open
updated: 2026-11-06
priority: P1
area: ui
plan: cross-surface-consistency
---

# History pager: failed press and failed refresh keep the reader and the failure visible

## What

Fix two defects in the pager's failure path. A failed press can move a reader who landed by a single jump to the tail, through the reading-row hold. A failed background refresh shows nothing in the ordinary thread, spends each press on a refetch, and leaves older pages unreachable. Also raise small ink on the pager plate to 4.5:1 over bright wallpaper, make the end of history line readable and inset, give a pinned failure a way out, and align the pager with the reading column.

## Why

A failure must never move the reader or hide itself, and the text on the plate is what the reader needs in that moment.

## Done when

Each case has a test at the production entry, the row holds through every failed press, a failed refresh is visible and paging still works, and the plate ink measures 4.5:1 on seeds over near-white wallpaper.

## Evidence

Filled at landing: what ran and where its output is.
