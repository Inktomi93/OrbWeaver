---
kind: tooling
status: open
updated: 2026-10-11
priority: P3
area: tooling
---

# Gate underscore folders and stray kit folders so 867 and 868 cannot backslide

## What

Add hard structure gates: no directory whose name starts with an underscore anywhere in the tree (Core-0 §3: no underscore junk drawers), after renaming the two survivors by role, tooling/src/verify/gates/\_proof and tests/tooling/verify/gates/\_liveness, with their importers, and no directory named kit outside packages/kit; each with mustFlag and mustPass proofs and a real-corpus liveness check.

## Why

Owner asked whether the architecture-law work prevents backsliding; 869 and 870 have hard gates and dep-cruiser rules, but 867 and 868 rest on law text and comments only.

## Done when

Both gates are registered in check:structure, prove a planted underscore folder and a planted kit folder outside packages/kit red, pass on the real tree, and Core-0 cites them; lands after the arch-law lane merges.

## Evidence

Filled at landing: what ran and where its output is.
