---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
---

# The connection editor's control values end in an ellipsis at enlarged text

## What

Item 2905 listed packages/client/src/features/credentials/components/connection-editor.tsx among the control values that end in an ellipsis. The w3-ui-wrap lane skipped it as out of bounds and did not try it, and no draft item carries it.

## Why

A value the reader chose the control for cannot be read whole on a phone at enlarged text.

## Done when

A reflow case at enlarged text on a phone mounts the connection editor and finds each value whole or opened through the shared reveal, red before the fix.

## Evidence

Filled at landing: what ran and where its output is.
