---
kind: bug
status: open
updated: 2026-11-16
priority: P3
area: chat
---

# The style element strip misses three prose renderers, can rebuild an element from its pieces, and has untested call sites

## What

From the review of the strip that keeps a stylesheet from printing as message text. Card greetings in the member card viewer under `packages/client/src/features/character/`, the example message preview in the character facet editor, and the reasoning block in a message row render prose without the strip. `stripStyleElements` in `packages/kit/src/content/index.ts` runs once, so crafted text whose pieces join into a style element after the first removal prints that element's CSS; the hidden-span strip repeats until nothing changes and this one does not. No test covers the strip in the search result message view or in the two greeting previews.

## Why

The same stylesheet-as-text defect remains on these surfaces, and three call sites can lose their strip with every test green.

## Done when

Each named renderer strips through the same reader, the strip repeats until the text is stable in linear total work, and each call site has a test that fails when its strip is removed.

## Evidence

Filled at landing: what ran and where its output is.
