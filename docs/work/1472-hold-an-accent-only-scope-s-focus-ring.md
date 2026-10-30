---
kind: bug
status: open
updated: 2026-10-30
priority: P3
area: ui
plan: css-system
---

# Hold an accent-only scope's focus ring above the outer carried edge

## What

An accent-only ThemeScope over a carried palette emits --color-ring as its own fill without re-holding it above the outer scope's solved input-border edge, so D159's ceiling can fail inside a character accent on a custom theme. Found by the 1464 work.

## Why

D159 says focus out-shouts rest under every carried scope.

## Done when

The accent-only scope solves its ring against the ambient carried edge with the kit solveFocusRing, pinned by a clamp test over the accepted bases.

## Evidence

Filled at landing: what ran and where its output is.
