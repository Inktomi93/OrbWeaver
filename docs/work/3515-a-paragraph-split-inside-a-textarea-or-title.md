---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: kit
---

# A paragraph split inside a textarea or title element turns a style held as text into live CSS in the next piece

## What

`paragraphBreaks` in `packages/kit/src/content/index.ts` does not record a text element such as `textarea` or `title` as unbroken, so a blank line inside one is a split point. A style element written as text inside it then opens the next bubble or run as a real style element. The effect stays inside the same reply at the same trust step.

## Why

A split should never change what a piece of the reply means.

## Done when

No split falls inside a text element, with a row under `tests/kit/content/`.

## Evidence

Filled at landing: what ran and where its output is.
