---
kind: bug
status: open
updated: 2026-10-19
priority: P2
---

# gate-spelling-twins examined floor is below the post-1041 gate corpus

## What

tests/tooling/gate-spelling-twins.int.test.ts fails on main: the census examined fewer fixtures than MINIMUM_EXAMINED after 1041 deleted gates with mustFlag fixtures. The floor guards against a broken loader, so it must track the live corpus, not the old one.

## Why

A stale floor turns a real shrink of the gate set into a red that says the loader is broken, which hides a real loader failure.

## Done when

The floor derives from or is justified against the live gate corpus, a planted empty loader still fails it, and the suite passes on main.

## Evidence

Filled at landing: what ran and where its output is.
