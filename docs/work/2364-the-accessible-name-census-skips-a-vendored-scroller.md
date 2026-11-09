---
kind: tooling
status: doing
updated: 2026-11-09
priority: P3
area: tooling
lane: wt/agent-a7e614c3dc6eac284
plan: cross-surface-consistency
---

# The accessible-name census skips a vendored scroller that its library cannot name

## What

The names census flags the theme builder's CodeMirror div.cm-scroller, a generic element with tabindex -1 that @codemirror/view builds itself and exposes no API to name (only contentAttributes and editorAttributes). The door census already drops a generic tabindex -1 node; the names census does not.

## Why

A finding no owner can fix buries the ones they can.

## Done when

The names census treats a generic tabindex -1 node the same way the door census does, a fixture shows it skipped and a named control still judged, and the theme builder checkpoint reads clean for it.

## Evidence

Filled at landing: what ran and where its output is.
