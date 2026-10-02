---
kind: plan
status: parked
updated: 2026-10-02
blocked: owner
---

# Spatial maps: places in a story

## Goal

Give a story a navigable sense of place when the owner resumes the program.

## Shape

The core concept connects story locations and the party’s position. Design the representation from Orbweaver’s needs, preserving selected-history state and viewer visibility.

## Open questions

The owner decides whether this belongs within RPG and what movement the product needs.

## Rejected

An inherited map hierarchy or feature list is not a committed design.

## Coupled sites

`packages/server/src/domain/rpg/`, `packages/server/src/domain/world-info/` and `packages/server/src/domain/chat/`.

## Test plan

A resumed design must prove movement, history selection, forks and viewer-specific projection.
