---
kind: work
status: doing
updated: 2026-10-28
priority: P2
area: tooling
lane: main
plan: cross-surface-consistency
---

# Finish parked worktree and stash recovery closeout

## What

Resolve every original parked worktree and stash using the private recovery inventory. Integrate useful work and remove redundant checkouts, stashes and recovery copies.

## Why

Unresolved parked changes can hide unfinished commitments, while obsolete snapshots can overwrite newer qualified implementations.

## Done when

Record a final disposition for every inventoried checkout and stash. Verify actual removal instead of treating queued cleanup requests as completion. Qualify and integrate active repairs before removing their trees. Retain only material needed for unfinished work or its verification.

## Evidence

Use `reports/surface-consistency-private/parked-work-closeout.md` and `reports/surface-consistency-private/parked-work-closeout.json` for the original inventory. Read `reports/surface-consistency-private/surface-walk-integration-progress.md` for current dispositions. Check live Git worktree and stash inventories before acting. Redundant copies are not unfinished work and must not remain solely for archival custody.
