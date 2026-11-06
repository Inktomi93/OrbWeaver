---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: ui
plan: cross-surface-consistency
---

# Collapse variant axes left with one value and remove the tokens they orphaned

## What

After the variant delete pass, drawer.side, highlighted-text.skin, selection-bar.placement, theme-swatch.size and text.transform hold only their default. Remove each axis and its prop where nothing needs the stamp, and keep the theme swatch data-size stamp if the audit reads it. Remove --stroke-width-icon-hairline and --height-picker-art-square from the tokens and the owner surface.

## Why

An axis with one value is a prop that selects nothing, and a token with no consumer is dead weight.

## Done when

Each axis is gone or kept with a recorded reason, and both tokens are gone from every generated file.

## Evidence

Filled at landing: what ran and where its output is.
