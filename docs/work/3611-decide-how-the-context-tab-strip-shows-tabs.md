---
kind: decision
status: blocked
updated: 2026-11-20
priority: P2
area: ui
blocked: owner
---

# Decide how the context tab strip shows tabs that do not fit

## What

Seven context tabs share a strip too narrow for them, and the overflow cuts a label mid-word, as in Preview and Look (packages/client/src/features/app-shell/components/context-rail.tsx). D313 rules a scrolling tab strip. Option A, recommended: the strip scrolls and snaps in whole tabs so no label is ever cut, which keeps D313. Option B: tabs that do not fit move into an overflow menu, which amends D313.

## Why

A tab cut mid-word reads as broken and hides what the tab is.

## Done when

The owner picks A or B, the ruling is recorded, and a work item to build it is minted.

## Evidence

Filled at landing: what ran and where its output is.
