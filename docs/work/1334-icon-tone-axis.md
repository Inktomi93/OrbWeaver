---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: ui
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

Filled at landing: what ran and where its output is.
