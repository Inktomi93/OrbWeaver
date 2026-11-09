---
kind: bug
status: doing
updated: 2026-11-09
priority: P3
area: client
lane: wt/agent-a88fe4fa1ec4fa014
plan: cross-surface-consistency
---

# Preset knob info button overlaps its number field at phone 200% text

## What

The knob label cell in `packages/client/src/features/preset/components/knob-row.tsx:291` docks its HintTrigger at the cell's trailing edge. At phone 200% text the trigger lies over the NumberField of Max output tokens and Max context tokens. Shows at phone 200% text on: Rail independent presets. The knob value cluster also takes the trigger's clicks.

## Why

The label track and the control track overlap, so the info button covers the edge of the field.

## Done when

The label cell and the number field do not overlap. These checkpoints show no enlarged-text geometry finding at 200% and 300% text: presets-preset-*-view-*. Every knob hint trigger in the Presets editor is clickable at 200% and 300% on chromium-phone-portrait; Rail independent presets passes its dialog walk there.

## Evidence

Filled at landing: what ran and where its output is.
