---
kind: work
status: doing
updated: 2026-11-08
priority: P2
area: testing
lane: wt/agent-a50a88db0026232d7
plan: surface-walk
---

# The walk's measurement pass runs at 200% and 300% text on phone and desktop for every surface

## What

Make the surface walk's measurement pass run at 200% and 300% text size on phone and desktop for every surface.

## Why

Three layout defects were found by hand: items 1753 and 1806, and the Echo foot. The platform-text-scale suite covers only the surfaces listed in it.

## Done when

Each surface reports geometry findings at both scales, on phone and on desktop.

## Evidence

Filled at landing: what ran and where its output is.

Why: 1753, 1806 and the Echo foot were found by hand; `platform-text-scale` covers only listed surfaces. Done when each surface reports geometry findings at both scales.
