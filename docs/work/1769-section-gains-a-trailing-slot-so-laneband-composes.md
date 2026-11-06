---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: ui
plan: type-law
---

# Section gains a trailing slot so LaneBand composes from it

## What

Give Section a trailing slot after its rule, and build LaneBand from Section.

## Why

packages/client/src/features/refinery/components/lane-band.tsx composes its band from a heading and a separator because Section has no trailing slot for the accept tally. Two drawings of one band can drift apart.

## Done when

Section accepts trailing content after its rule. lane-band.tsx renders through Section and no longer composes the heading and separator itself. The refinery component tests pass.

## Evidence

Filled at landing: what ran and where its output is.
