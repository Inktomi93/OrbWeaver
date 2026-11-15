---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: chat
---

# Inline <style> text from a display script prints as prose on the inert path

## What

On a tierA row, while streaming, and on a refused mint, a display script's <style> element is dropped but its CSS text survives as visible prose (rehype-sanitize's default strip list covers script only).

## Why

The inert path should consume the tags and drop the styles, not print the stylesheet into the reply.

## Done when

The inert path renders no CSS text from a <style> element, proven by the plain-text case in tests/client/features/chat/components/styled-reply-frame.ct.tsx asserting the stylesheet text is absent.

## Evidence

Filled at landing: what ran and where its output is.
