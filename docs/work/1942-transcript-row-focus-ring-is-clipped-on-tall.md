---
kind: bug
status: open
updated: 2026-11-06
priority: P1
area: ui
plan: cross-surface-consistency
---

# Transcript row focus ring is clipped on tall rows

## What

A focused row taller than the scrollport shows no focus ring on desktop. Main does the same. A planted inset outline paints. See message-list.tsx and lib/focus-ring.ts.

## Why

A keyboard reader loses visible focus on long messages, which fails WCAG 2.4.7.

## Done when

A focused row shows its ring at every width, tall rows included, with a CT asserting it.

## Evidence

Filled at landing: what ran and where its output is.
