---
kind: bug
status: doing
updated: 2026-11-08
priority: P2
area: client
lane: wt/agent-aeb8f21def3afc3d1
plan: cross-surface-consistency
---

# Multiplayer pin copy names the player

## What

The room block's pin lines never name the player: personaWithPlayer receives the persona-derived display name, so when the host and a member both use a persona called Traveler, every line reads Traveler. Pass the player's own name.

## Why

When two players share a persona name the pin lines cannot say whose pin is whose.

## Done when

The pin lines name both the persona and the player when they differ in identity, with a CT where two players share a persona name. Source: acceptance part 2 report M1.

## Evidence

Filled at landing: what ran and where its output is.
