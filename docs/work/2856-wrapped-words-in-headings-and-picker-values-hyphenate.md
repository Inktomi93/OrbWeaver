---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: ui
plan: cross-surface-consistency
---

# Wrapped words in headings and picker values hyphenate instead of splitting mid-word

## What

At enlarged text, a heading set with the word-wrap voice and the wrapped value of a hug-wrap Select break inside a word with no hyphen, so a heading reads as a word ending one letter short and a lone letter on the next line. The break rules are the `wrap` axis in `packages/ui/src/primitives/text/variants.ts` and the `hugWrap` value in `packages/ui/src/primitives/select/variants.ts`.

## Why

A word split without a hyphen reads as a typo rather than as enlarged text.

## Done when

A component test in `tests/ui/primitives/select/` and one in `tests/ui/primitives/text/` mount a long word at 200% text in a pane narrower than the word. Each asserts that the computed hyphens value is auto and that a break inside the word ends in a hyphen. Both are red before and green after.

## Evidence

Filled at landing: what ran and where its output is.
