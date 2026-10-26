---
kind: work
status: doing
updated: 2026-10-26
priority: P3
area: client
lane: main
---

# Reduce empty RPG context-band density without hiding state

## What

Review the empty ambient band in game-chat Context. Preserve the persistent band, freshness and game shortcuts while reducing decoration that carries no state.

## Why

The live phone Plugins view spends about 184px on host chrome before panels, including a 96px unset Waystone. Folding panels works, but empty-state decoration dominates their context.

## Done when

Reconcile the existing one-step-smaller unset Waystone policy before changing it. Use governed display sizes, preserve data and accessibility, and verify portrait, landscape and desktop panel widths. Record the rendered comparison in the composer implementation review.

## Evidence

The unset Waystone uses the existing smallest display step. D119 records that policy; populated sizing and persistent Context state remain unchanged.
Production header and meter cases pass with actual empty and populated states. Live phone Context and desktop pane captures confirm the reduced decoration.
Independent source and screenshot reviews close the density finding. The [implementation review](../reviews/composer-implementation-review.md) records the evidence.
