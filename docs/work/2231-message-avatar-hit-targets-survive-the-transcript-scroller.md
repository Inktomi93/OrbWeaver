---
kind: bug
status: doing
updated: 2026-11-08
priority: P2
area: client
lane: wt/agent-acaf86636920912a1
plan: cross-surface-consistency
---

# Message avatar hit targets survive the transcript scroller's clip

## What

The avatar reach is a centred 44x44 pseudo-element, but the transcript scroller clips it at its left edge, so the rendered hit area is 38px wide, and the design audit still flags the avatar. The CT checks only the pseudo-element size.

## Why

2174's done line is the rendered target meeting the coarse floor, and the clipped reach misses it.

## Done when

At a coarse pointer the avatar's hit-testable area inside the real transcript meets the floor, proved by a CT that hit-tests points at the reach edges inside the scroller, and the design audit no longer flags it. Source: acceptance part 3 report, 2174.

## Evidence

Filled at landing: what ran and where its output is.
