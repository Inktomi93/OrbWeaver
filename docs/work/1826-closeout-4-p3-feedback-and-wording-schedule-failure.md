---
kind: bug
status: doing
updated: 2026-11-07
priority: P3
area: client
lane: wt/agent-a5e487c45520cd7c1
plan: cross-surface-consistency
---

# Closeout 4 P3 feedback and wording: schedule failure triple message, add document double alert, Reset focus to body, four filtered-list wordings, doubled member names

## What

Fix five feedback and wording findings from the closeout 4 side-eye review. A failed schedule shows three messages. A failed add document shows two alerts with two different words. Reset to default and its Undo drop focus to the page body. Filtered lists use four wordings for their counts. Member names print twice, as in Nate 2 (Nate 2).

## Why

The review found these on screen. The composition ruling allows a toast plus one inline message, and these go past it.

## Done when

Each finding is fixed with a component test, or answered with a cited reason. One failed action shows at most one toast and one inline line, and the filtered lists share one wording.

## Evidence

Filled at landing: what ran and where its output is.

Source: `reports/side-eye/2026-11-01-closeout-4.md` (gitignored, on main's checkout), run on 822d61a82e. Each finding there carries its run ids.
