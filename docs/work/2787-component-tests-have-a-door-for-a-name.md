---
kind: work
status: open
updated: 2026-11-13
priority: P3
area: testing
plan: test-foundation
---

# Component tests have a door for a name that carries a count

## What

Only `tests/e2e/support/surface-walker.ts` can turn a production label function into a pattern. A component test that asserts a name such as a shown-of-total line writes the pattern by hand, so those sites stay hand-typed and the label census counts them as templates.

## Why

A hand-written pattern keeps passing or failing for the wrong reason when the production label changes.

## Done when

The browser testkit exposes one helper that builds the pattern from the production label function, and the character-picker component test uses it.

## Evidence

Filled at landing: what ran and where its output is.
