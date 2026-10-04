---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: connection
---

# The embed width confirm checks the width before it warns

## What

The rebind/width confirm ('deletes your search index…') opens before the server's width probe, so a change the server then refuses (an unmakeable width) first warns about deleting the index. Found by the 0507 side-eye spot-check (P3-E).

## Why

A destructive warning for a change that will not happen is noise and erodes trust in the confirm.

## Done when

The change preview runs the same width check the save runs (or the save is dry-run first), so an unmakeable width is refused before any confirm; a CT covers it.

## Evidence

Filled at landing: what ran and where its output is.
