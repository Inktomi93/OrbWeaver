---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# The frame lift garbles literal text where Markdown does not read the tags as HTML

## What

The framed reply's raw-text lift (`liftRawTextBodies`, beside `packages/ui/src/markdown/frame/frame-markdown.tsx`) lifts a style or script body inside a code span, after a backslash escape, in a link title or image alt text, and inside a textarea. The restore drops the stand-in from text and leaves it in attributes. Inline code that names both tags merges into one span, escaped or textarea text loses its words, and a link title or alt text shows the stand-in characters.

## Why

These are changes against the earlier render on the framed path, and the stand-in is meant never to print.

## Done when

A stand-in outside a style or script element restores as its original text, attribute values included. An element whose body crosses a code-span backtick is not lifted. A node test over FrameMarkdown covers each case and fails before the fix.

## Evidence

Filled at landing: what ran and where its output is.
