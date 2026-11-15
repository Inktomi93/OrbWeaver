---
kind: bug
status: open
updated: 2026-11-15
priority: P1
area: kit
---

# A stray backtick or comment opener in the prose beside a panel prints the panel's stylesheet as text

## What

`readMarkup` in `packages/kit/src/content/index.ts` pairs a backtick run with the next one before a blank line, and skips a comment that opens in the middle of a line to its close. Both readings cross the start of an HTML block, a list item or a quote, where Markdown ends the paragraph. An unmatched backtick on the line before a panel, with another backtick later in the same paragraph run, hides the panel's style element from the plain path's strip. A comment opener in the middle of a line before a panel hides it from the frame lift as well.

## Why

A model writes a stray backtick often, and the reader then sees the stylesheet as message text, which is the defect this work removes.

## Done when

A code span and a comment that opens in the middle of a line end where the reader's own line reading starts a new block. The review's two reproductions fail first and then pass on the frame and on the plain path, in tests under `tests/kit/content/`.

## Evidence

Filled at landing: what ran and where its output is.
