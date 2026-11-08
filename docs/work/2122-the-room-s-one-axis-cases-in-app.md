---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: client
plan: cross-surface-consistency
---

# The room's one axis cases in app-shell-motion hold under load

## What

Two room's one axis cases in tests/client/features/app-shell/surfaces/app-shell-motion.ct.tsx fail in some whole-file runs on main, with a 96px jump and a plugin broker runtime terminated by lifecycle error, and pass in others.

## Why

A case that fails on main under load hides a real regression in the room's motion behind noise.

## Done when

The cause is named, product or case, and fixed, and the whole file passes repeatedly under the same load it failed at.

## Evidence

Filled at landing: what ran and where its output is.
