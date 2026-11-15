---
kind: work
status: open
updated: 2026-11-15
priority: P3
---

# The styled hold shows a tag line whose name carries a NUL

## What

scanStyledHold opens an element block only on a tag name of word characters, dots and dashes. A tag line such as '\<det\u0000ails>' is not held, so its inner text reaches the inert allowlist while the reply forms.

## Why

A region a display script hides must never show while it forms (D354); a NUL is stripped later at write, but the stream path reads the raw text.

## Done when

A row in tests/kit/content/styled-hold.test.ts holds a tag line with a NUL in its name, red against today's scan.

## Evidence

Filled at landing: what ran and where its output is.
