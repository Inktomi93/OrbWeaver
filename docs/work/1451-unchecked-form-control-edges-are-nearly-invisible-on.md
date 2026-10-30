---
kind: bug
status: open
updated: 2026-10-30
priority: P2
area: ui
---

# Unchecked form-control edges are nearly invisible on mid-grey custom themes

## What

On a mid-grey custom theme, an unchecked checkbox's border is nearly invisible (1.46:1 on `oklch(0.6 0 0)`). Every D159 carrier shares the static `--color-input-border`, so radio, switch and the field controls fail the same way.

Ruling: a per-primitive override is refused; it breaks D159's ceiling under the focus ring on every seed. `--color-input-border` stays static on the seeds, and under a carried custom background the ThemeScope clamp emits it, solved between the 3:1 floor and the scope's focus-ring ceiling, as the D336 knobs are. D159 is amended in place in the same commit.

## Why

Pre-existing; side-eye found it during the tone review. An unchecked control must show its boundary (WCAG 1.4.11).

## Done when

Every D159 carrier's resting edge clears 3:1 against its host and stays below the focus ring on card, in each seed and on `oklch(0.6 0 0)`, pinned by a carrier CT and a clamp unit test.

## Evidence

Filled at landing: what ran and where its output is.
