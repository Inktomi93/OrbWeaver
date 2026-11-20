---
kind: work
status: doing
updated: 2026-11-20
priority: P1
area: client
lane: wt/agent-a0f363f919c3e186a
plan: cross-surface-consistency
---

# HOVER_REVEAL.focus has no consumer and reveals on a tap

## What

packages/ui/src/lib/hover-reveal.ts `focus` posture is opacity-0 and inert at rest, shown on ungated group-hover / group-focus-within. Its comment says a touch reader never sees it, but a tap sets both. No file in packages/ui/src or packages/client/src selects reveal="focus".

## Why

Same class as the ListRow subtitle swap; a future consumer would show hidden controls on tap.

## Done when

Delete the variant, or gate its show half with HOVER_SWAP's condition (hover-capable:group-hover, group-has-focus-visible) and cover it by a coarse-pointer CT.

## Evidence

Filled at landing: what ran and where its output is.
