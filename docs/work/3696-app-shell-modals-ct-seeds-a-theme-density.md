---
kind: bug
status: open
updated: 2026-11-20
priority: P2
area: client
plan: test-foundation
---

# app-shell-modals CT seeds a theme density the theme contract no longer accepts

## What

tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx seeds override.density on a theme, and the server's input validator refuses it as an unrecognized key: packages/contracts/src/theme/index.ts has no density field. The case fails before the shell renders, so the density inheritance it claims to prove is unproven on main. Found by the accent-theme lane's CT batch; not yet re-run on a clean tree.

## Why

A CT that fails in setup proves nothing about the portal's density, and a red that everyone ignores hides the next real one.

## Done when

The case seeds density through its current production home, passes on main, and goes red when the portal stops inheriting density.

## Evidence

Filled at landing: what ran and where its output is.
