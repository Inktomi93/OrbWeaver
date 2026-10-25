---
kind: work
status: doing
updated: 2026-10-25
priority: P2
area: ui
lane: closeout/css
plan: css-system
---

# Icon carries a tone axis

## What

31 feature sites paint `Icon` with colour classes because `Icon` has no `tone` prop; item 1316's `orb/feature-classname-layout-only` reports them.

## Why

The paint law gives features no colour classes; icon colour is a primitive skin.

## Done when

`Icon` takes `tone` from the same semantic set `Text` uses; a codemod moves the 31 sites; the rule reports zero `Icon` findings.

## Evidence

Icon uses the shared TONE_INK map. Feature color classes are drained and the enabled layout-only className rule reports no Icon paint findings in the full client lint run. The existing className-drain CT passes in the current scoped rendered selection.

See [CSS closeout](../reviews/css-closeout.md) for exact check selections, artifacts and remaining limits.
