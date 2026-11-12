---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
plan: test-enforcement
---

# A component test names a row in a recycling list by its name, not its position

## What

A case that picks a row with a positional locator and reads it again after the list scrolls can resolve to a different row, because a virtualized list recycles its rows. The selection bar pane share case failed in CI that way while the product was correct. `.claude/rules/browser-tests.md` does not say so, and nothing refuses the shape.

## Why

The failure reads as a product regression and costs a bisect to clear.

## Done when

The browser test rule states that a row read after a scroll is located by name, and a lint rule or a testkit helper refuses or replaces a positional locator reused after an action on a virtualized list, with a planted control.

## Evidence

Filled at landing: what ran and where its output is.
