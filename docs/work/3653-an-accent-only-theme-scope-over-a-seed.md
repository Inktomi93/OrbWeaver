---
kind: bug
status: doing
updated: 2026-11-20
priority: P2
area: ui
lane: wt/agent-a3ade30f662ad8af9
plan: cross-surface-consistency
---

# An accent-only theme scope over a seed palette meets the tone floors

## What

accentAndTonesOn with no carried background resets the primary literals and paints a mix of the accent and the seed foreground with no judgment, so neither the D336 text floor nor the D355 inactive floor applies to an accent-only scope over a seed palette.

## Why

A pale accent picked over the Light seed paints primary text under 4.5:1.

## Done when

The clamp judges that primary over the seed's hosts through one shared seed palette reader, with a matrix case per seed.

## Evidence

Filled at landing: what ran and where its output is.
