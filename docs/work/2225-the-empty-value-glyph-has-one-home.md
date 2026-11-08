---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: client
lane: wt/agent-a53049a5655c3c496
plan: cross-surface-consistency
---

# The empty-value glyph has one home

## What

Stats, rpg, discovery, preset, refinery and chat each spell their own lone em dash for a missing value (for example analytics-view-model.ts, unset-datum.ts, format-count.ts, payload-view\.tsx, swipe-strip.tsx). Give the no-value glyph one home in kit or ui and read it from every site, with its accessible name.

## Why

One home per concept: a second copy of the placeholder drifts, and a screen reader hears a bare dash at each site.

## Done when

Every no-value placeholder reads the one constant, no feature spells the glyph itself, and the tests that read a placeholder import it.

## Evidence

Filled at landing: what ran and where its output is.
