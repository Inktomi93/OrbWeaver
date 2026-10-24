---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: client
plan: css-system
---

# Stale enforcement claims in the UI law are corrected

## What

From the audit: `UI-Primitives-and-Reuse.md` §13.9 names ESLint `max-lines` as the UI source limit (absent); §13.1 and `ui-package-design.md` §6.2 say `createCollectionSurface` bakes `maxPages` while `orb/windowed-infinite-query` bans `maxPages`; `ui-package-design.md` §14 names a `baseui-anatomy` gate (absent); the law calls dependency-cruiser's rule `ui-no-node-builtins` (it is `browser-and-iso-no-node-builtins`); lockdown §6a names a registry-derived roster CT census (absent); the restoration register names tests that do not exist (switch CT, `theme-emit-pairing`, `seed-theme-pairing`, `palette-contrast`, `emit-surface`, `appearance-message-style-section`).

## Why

A doc that names a missing check misleads every reader that trusts it.

## Done when

Each claim is made true (the check added, with a control) or removed from the law, decided per row with a reason in this item's Evidence; the register rows point at real tests or say the case is unbuilt.

## Evidence

Filled at landing: what ran and where its output is.
