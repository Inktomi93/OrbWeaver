---
kind: bug
status: open
updated: 2026-10-30
priority: P3
area: ui
plan: css-system
---

# Step 3 and 1448 rendered polish bundle

## What

From the shell-edges and carried-tones side-eye report under reports/side-eye/: the narrower NumberField truncates the placeholder 300 (provider default) further (F9); 28px chips in the 32px combobox have a 2px vertical inset against 10px horizontal (F10); on a mid-grey custom theme the primary text-on-tint resolves to pure black with no hue while warning and success inks keep about C 0.03 (F8).

## Why

Small visible regressions from the control scale and the carried tone solve.

## Done when

The placeholder fits or wraps by design, combobox chips have a balanced inset from tokens, and primary text-on-tint keeps its hue where the floor allows, each pinned by a CT or the tone-knobs suite.

## Evidence

Filled at landing: what ran and where its output is.
