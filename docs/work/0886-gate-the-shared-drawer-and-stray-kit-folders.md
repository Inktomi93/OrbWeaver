---
kind: tooling
status: open
updated: 2026-10-11
priority: P3
area: tooling
---

# Gate the \_shared drawer and stray kit folders so 867 and 868 cannot backslide

## What

Add hard structure gates: no directory named \_shared anywhere in the tree, and no directory named kit outside packages/kit; each with mustFlag and mustPass proofs and a real-corpus liveness check.

## Why

Owner asked whether the architecture-law work prevents backsliding; 869 and 870 have hard gates and dep-cruiser rules, but 867 and 868 rest on law text and comments only.

## Done when

Both gates are registered in check:structure, prove a planted \_shared folder and a planted kit folder outside packages/kit red, pass on the real tree, and Core-0 cites them; lands after the arch-law lane merges.

## Evidence

Filled at landing: what ran and where its output is.
