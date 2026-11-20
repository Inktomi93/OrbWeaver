---
kind: tooling
status: open
updated: 2026-11-20
priority: P3
area: tooling
plan: cross-surface-consistency
---

# The disabled-style lint rules cover every spelling

## What

The stylelint disabled-selector rule misses \[disabled], :not(:enabled), @variant disabled, @apply disabled: and uppercase selectors; the ESLint rule misses disabled:grayscale, brightness, saturate, line-through, invisible, decoration, a bare opacity-(--opacity-disabled), and a tv() variant keyed disabled: { true }, and wrongly refuses not-disabled:. No real site uses any of these.

## Why

A rule with known holes lets a second disabled home back in unseen.

## Done when

Each listed spelling is refused, not-disabled: is allowed, and a rule test plants each one.

## Evidence

Filled at landing: what ran and where its output is.
