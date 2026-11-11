---
kind: bug
status: doing
updated: 2026-11-11
priority: P2
area: client
lane: wt/agent-ab272ed4fef9cc84a
plan: cross-surface-consistency
---

# Focus falls to the page body after a confirmed delete in Characters, Looks and Regex

## What

After a delete confirmed by keyboard, focus drops to the page body in three places: deleting the open character, a theme in Looks, and a regex script. Edit in builder in Looks does the same. Databank and Presets keep focus because they use the shared row-delete focus hook; these surfaces do not (packages/client/src/features/config/components/appearance-looks-section.tsx is one). The rendered re-check also saw focus go to the list frame, not the row above, after deleting the last Databank row in some tries, cause not found. Source: the client rendered re-check report under reports/review.

## Why

A keyboard or screen-reader user loses their place after every delete on these surfaces, and the shared hook that prevents it already exists.

## Done when

Each of the four paths uses the shared row-delete focus hook or the dialog's return focus, and a component test per surface deletes by keyboard and asserts focus lands on the neighbouring row or the list's empty-state control, never the body. The Databank last-row case is reproduced and fixed or recorded as not reproducible.

## Evidence

Filled at landing: what ran and where its output is.
