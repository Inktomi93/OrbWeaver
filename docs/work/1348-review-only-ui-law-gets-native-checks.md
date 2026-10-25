---
kind: tooling
status: doing
updated: 2026-10-25
priority: P1
area: client
lane: cb-uilaw
plan: css-system
---

# Review-only UI law gets native checks

## What

UI and client law rules with no check today: manual memo outside compiler-skipped files; useInfiniteQuery outside createCollectionSurface; the React 19 skip list (useOptimistic, useActionState, useFormStatus, form action, use() on a promise, document.title writes); transition-all; lifecycle keyframes on Base UI parts; exit animation only on a child; suspending reads outside QueryBoundary; one primary per region, one focal element, no box in a box, no same-tier Surface nesting; the ui primitive file shape; law docs citing rule names that do not exist.

## Why

Owner: every law that can be enforced gets enforced. These pass review today only by attention.

## Done when

Each rule has a native lint, dependency-cruiser rule, repo test or rendered census CT with planted controls, every existing site is fixed, and each rule is on at zero; a rule that cannot be checked soundly is recorded with the reason; the two stale rule names in UI-Architecture-and-Layout.md are corrected and a repo test fails on any cited rule name that does not exist.

## Evidence

Filled at landing: what ran and where its output is.
