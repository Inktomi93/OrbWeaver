---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: ui
---

# Pictures from completed tool depths are lost when Stop keeps a reply

## What

A Stop after an image tool depth finished keeps the prose but stores no inline assets, because the store runs under the aborted turn signal.

## Why

A picture the reader already saw stream in disappears from the kept reply.

## Done when

Inline assets from completed depths are stored on a kept stop, under a signal not bound to the stopped turn, with a case.

## Evidence

Filled at landing: what ran and where its output is.
