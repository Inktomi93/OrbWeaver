---
kind: tooling
status: open
updated: 2026-11-06
priority: P3
area: ui
plan: cross-surface-consistency
---

# Pin container query thresholds to their tokens with a stylelint rule

## What

A container query cannot read a custom property, so rem thresholds in @container and @custom-variant repeat token values by hand. Add a stylelint rule in stylelint-rules.ts that each threshold equals a generated --container-cq-\* or --breakpoint-\* value.

## Why

A token change can leave hand-spelled thresholds behind with nothing to report it.

## Done when

Changing a container token fails stylelint at each stale threshold, and every current threshold passes.

## Evidence

Filled at landing: what ran and where its output is.
