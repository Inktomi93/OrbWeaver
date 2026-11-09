---
kind: tooling
status: doing
updated: 2026-11-09
priority: P3
area: tooling
lane: wt/agent-a7e614c3dc6eac284
plan: cross-surface-consistency
---

# The collision census judges a subject pushed past the window edge

## What

census-collision.ts skips any subject outside the visual viewport, so a count pushed past the window edge by an over-wide row reached no rule: on Corpus Archetypes the 3 members count sat outside the pane clip and off the window, and clipped-overflow judged 369 subjects with none affected.

## Why

An element a layout pushes off screen is the defect, and skipping it reads as clean.

## Done when

A subject outside the viewport because its scroller or row overflows is judged against its clip, a fixture with a count pushed past the window edge fails, and a subject merely scrolled out of view stays skipped.

## Evidence

Filled at landing: what ran and where its output is.
