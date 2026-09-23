---
kind: work
status: open
updated: 2026-09-23
priority: P1
area: docs
plan: doc-migration
---

# Import the open GitHub board rows into docs/work before the board tool is removed

## What

Export every open row of GitHub Project 1 (Triage, Ready, Running, Review, Blocked, Parked, Needs
owner). Create one `docs/work` item per row with `pnpm doc item`, carrying kind, priority, area and the
row's what, why and done-when. Triage on the way in: close on the board, with a reason, any parked row
whose wake condition can never fire, any row the tree already satisfies, and any duplicate.

Owner ruling: import with hard triage. Import only the rows that still hold on the tree; close the
rest.

## Why

The owner is removing the board. Its API throttles, and its state goes stale. Item 0013 deletes the
board tool, so the open work must exist in the repo first.

## Done when

Every open board row is a `docs/work` item or is closed with a stated reason, and this item's evidence
lists both sets. `pnpm doc overview` shows the imported rows. Item 0013 can start.

## Evidence

Filled at landing: what ran and where its output is.
