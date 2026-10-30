---
kind: work
status: open
updated: 2026-10-30
priority: P2
area: ui
plan: css-system
---

# Keep each tone's hue on custom backgrounds with literal per-tone role emission

## What

On a mid-grey carried background (`oklch(0.6 0 0)`), every status colour collapses to grey: tints sit within ΔE 0.5–0.9 of the background, every intent's `text` ink equals the foreground, and the warning box is 1.01:1. Under D336's mix-only rule this cannot be fixed, because `color-mix` toward a fixed endpoint scales chroma with lightness.

Ruling: a carried scope emits literal per-tone role colours, the channel the chart ramp already uses (`var(--tone-<tone>-<role>, color-mix(...))`). The clamp solves each role's lightness while keeping the tone's hue and a minimum chroma. Tints keep ΔE ≥ 0.02 (OKLab) from the background. Hue-adjacent pairs, such as Hearth's primary and warning at 0.012, are exempt from the pairwise floor. Amend D336 to replace mix-only for carried scopes.

## Why

D336 says a custom theme gets correct tints and inks. Side-eye (`reports/side-eye/2026-10-30-tone-roles-step1.md`, finding 2) showed status meaning lost on mid-grey.

## Done when

On `oklch(0.6 0 0)`, every tone's text, tint and solid keeps its hue, every role clears its D336 floor, and every tint clears ΔE 0.02 from the background. The matrix suite asserts both floors, with zero misses, over the accepted bases.

## Evidence

Filled at landing: what ran and where its output is.
