---
kind: tooling
status: doing
updated: 2026-11-10
priority: P3
area: tooling
lane: wt/agent-a461ab89d9d634803
plan: cross-surface-consistency
---

# Audit engine review P3 bundle for the precision batch

## What

From the cb-eng code review report under reports/code-reviewer: the alert role sits on a Row, Stack or div wrapper at 41 product sites, now unjudged by caveat-outweighed; capsVoiceRecipe has no length bound and its voice set has no drift pin against the Text recipe; the data-font-preview attribute is honoured outside a listbox or option; unpaintedEdge now absorbs transparent-bordered buttons.

## Why

Each leaves a blind spot or a drift path in a rule the walk relies on.

## Done when

Each is closed with a fixture, or answered with a cited reason in this item's Evidence; the 41 wrapper sites either move the role onto the caveat's own block or the rule reads them.

## Evidence

Filled at landing: what ran and where its output is.
