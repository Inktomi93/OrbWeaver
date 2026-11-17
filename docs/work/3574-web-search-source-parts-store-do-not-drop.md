---
kind: work
status: open
updated: 2026-11-17
area: inference
---

# Web-search source parts: store, do not drop

## What

The V4 fold in backends/v4/stream.ts drops source parts (web-search citations; OpenRouter and Anthropic emit them) and text-end citation metadata. The app runs no web-search feature today, but the owner ruled the parts are stored, not dropped: the result contract gains the field and the fold keeps them. No UI is promised.

## Why

A model that retrieved the web currently hands back text with the URLs silently stripped; storing costs one contract field and keeps the fact for whatever consumes it later.

## Done when

The result contract carries source parts, the fold keeps them, a fold test feeds a stream with source parts, the contracts typecheck and inference tests pass.

## Evidence

Filled at landing: what ran and where its output is.
