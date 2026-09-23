---
kind: bug
status: open
updated: 2026-09-23
priority: P2
area: tooling
---

# Bound doc drift Closes-trailer scan by the trailer itself, not a commit-count window

## What

drift, through tree.ts recentMainCommits, read only the last RECENT_MAIN_COMMITS=200 commits of main for Closes: trailers. A merge train longer than that buries a closing commit past the window, and drift reports nothing: items 8, 17 and 39 sat open silently after a 118-commit train.

## Why

The question drift asks is which open item some commit on main closes, not which commit landed in the last N. A count-bounded scan answers a different question and goes silently wrong the moment a merge train outgrows the constant.

## Done when

recentMainCommits and RECENT_MAIN_COMMITS are gone. drift scans main's full history for commits carrying a Closes trailer, filtered by the trailer text itself rather than a window, verified under 0.1s on this repository's real, roughly 8000-commit history. A commit buried deeper than the old 200-commit window is still reported; an item closed and then deleted stays silent.

## Evidence

Filled at landing: what ran and where its output is.
