---
kind: bug
status: doing
updated: 2026-10-10
priority: P1
area: client
lane: wt/agent-aef6c77e794b77492
---

# Main CI is green after the database census commits

## What

CI run 38091437396 on 5b245a8 fails 2 node tests (service.int loadParticipantViews; invalidation-reads chatReads set) and 21 CT cases across config-list-surface, config-content-surface, home-column-balance, home-surface first-boot tiles, character-library-surface census count and F2 filter, chat-list-surface filter count, analytics-overview P1d, motion-flaggers census. Last green: 1da3e1ad.

## Why

Main is red; the failures cluster on the database census and bounded-read commits.

## Done when

Each failure is reproduced on main, classified as stale fixture or product regression, and fixed; the named files pass locally and the next main CI run is green on those jobs.

## Evidence

Filled at landing: what ran and where its output is.
