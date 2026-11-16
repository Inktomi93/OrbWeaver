---
kind: bug
status: open
updated: 2026-11-16
priority: P2
area: chat
plan: chat-html-and-presets
---

# A reused reference-link title can expand a reply into a far larger frame document

## What

A Markdown reference-link definition whose title many links reuse makes the Markdown render copy the title into every link's title attribute. A reply shaped this way produces a frame document many times its own size and takes seconds to render. It is independent of the frame lift and is seen on the framed reply path; the plain path is not yet measured.

## Why

A member's message or a card greeting can inflate the frame document and its request, and slow or stall a viewer's tab. The stored message cap bounds the input, not the output.

## Done when

The expansion is reproduced on the plain and framed paths with the ratio and time recorded. Rendered output is bounded by a stated rule, or the measured worst case at the stored message cap is shown to be safe. A test covers the shape.

## Evidence

Filled at landing: what ran and where its output is.
