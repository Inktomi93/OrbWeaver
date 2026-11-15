---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: chat
---

# Streamed text reflows when the reply commits because the streaming row drops paragraph spacing

## What

While a reply streams, its paragraphs sit on bare line breaks with no gap. When the reply settles, paragraph spacing appears and everything below the first paragraph moves down at once. This happens on every provider without any styling preset.

## Why

Every reply ends with a visible jump in the text the reader is following.

## Done when

The streaming row lays out paragraphs with the same block spacing as the settled row, so the text does not move at commit. A CT compares the streaming and settled heights for the same multi-paragraph text.

## Evidence

Filled at landing: what ran and where its output is.
