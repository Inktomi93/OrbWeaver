---
kind: bug
status: open
updated: 2026-11-10
priority: P2
area: client
plan: cross-surface-consistency
---

# The new-chat picker keystroke CT holds its list height

## What

tests/client/features/app-shell/surfaces/new-chat-picker-keystroke.ct.tsx fails on main: the picker's list drops from 243px to 80px under rows of 88px. It fails with the same numbers on main before the enlarged-text fixes merged, so it predates them; the cause is not yet named.

## Why

A red CT on main hides the next real failure in the picker, and a list squeezed under one row is a broken new-chat picker if the product does it too.

## Done when

The cause is named (a product change to the picker's box or reservation, or a stale test expectation) and fixed at its owner, and the CT passes in Chromium and WebKit on main.

## Evidence

Filled at landing: what ran and where its output is.
