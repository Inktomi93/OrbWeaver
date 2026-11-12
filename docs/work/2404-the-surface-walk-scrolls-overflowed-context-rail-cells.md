---
kind: tooling
status: open
updated: 2026-11-12
priority: P3
area: testing
plan: surface-walk
---

# The surface walk scrolls overflowed context-rail cells into view so their captions are judged

## What

At 1440 wide the chat room's context state rail overflows: the plugins, Game and Activity cells sit past the strip's end, so their captions are excluded as unseenInFrame at every checkpoint and are never judged by contrast or text-over-art.

## Why

A caption no checkpoint ever shows is unjudged, and the per-frame exclusion would hide that gap forever.

## Done when

The walk's scroll-window traversal scrolls the context strip so each cell is in view at one checkpoint, and every caption is judged at least once per case; the case report shows zero never-judged captions on the strip.

## Evidence

Filled at landing: what ran and where its output is.
