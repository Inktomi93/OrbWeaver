---
kind: work
status: doing
updated: 2026-10-25
priority: P2
area: ui
lane: closeout/css
plan: css-system
---

# Layout primitives carry no surface paint

## What

About 70 feature sites give `Row`, `Stack` or `Card` a border, radius or `bg-card` through `className`.

## Why

A bordered, rounded, filled box is a surface; surfaces are `Card` or `Surface` variants, not layout classes.

## Done when

Each shape maps to a `Card` or `Surface` variant (new ones named in the plan); a codemod moves the mechanical sites; `orb/feature-classname-layout-only` reports zero `Row`/`Stack`/`Card` paint.

## Evidence

Filled at landing: what ran and where its output is.
