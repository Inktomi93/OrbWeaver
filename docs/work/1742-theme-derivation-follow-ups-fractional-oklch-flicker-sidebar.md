---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: ui
plan: cross-surface-consistency
---

# Theme derivation follow-ups: fractional OKLCH flicker, sidebar fields not solved, solveInputBorder judges the variable not the painted fill, tone text on popover misses AA

## What

Close the four carried-palette paint defects. A typed fractional base near the black/white crossover must solve: each ramp member the projection holds takes its ink at the base's polarity. `solveInputBorder` judges every fill a control paints, including the opaque `--color-field-fill` of a light palette. `tone-text` holds 4.5:1 on `popover` and `sidebar`, and the page ink is solved on both. The `fieldPanels` sidebar finding is already closed: the page ink, the muted ink and the edge judge the field over the sidebar, and no field carrier paints `--color-sidebar-foreground`.

## Why

`oklch(0.5606 0.12 240)` and `oklch(0.5548 0.25 120)` threw inside the clamp: the card ink flipped to white beside a black page ink, so no tint could clear both. The accepted matrix steps 0.01 in lightness and never lands on them. `oklch(0.6599 0.14 30)` painted a resting edge at 1.011:1 on its text field, because the solve judged the `--color-input` wash. Carried tone text measured 3.85:1 on the popover and 4.09:1 on the sidebar.

## Done when

`clampThemeTokens` solves every base in `CROSSOVER_BASES`, and its card, popover and secondary inks stay on the page ink's side at AA. The edge holds 3:1 on `--color-input` and `--color-field-fill` over every panel across `ACCEPTED_BASES`, and in the painted pixels of the carrier CT. Every colored tone's text and the page ink clear AA on the popover and sidebar across `ACCEPTED_BASES`. The token build fails a seed under the `tone-text` floor.

## Evidence

Filled at landing: what ran and where its output is.
