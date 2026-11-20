---
kind: work
status: doing
updated: 2026-11-20
priority: P2
area: preset
lane: wt/agent-a5a1b620d744a7d7d
plan: cross-surface-consistency
---

# Controls the connected model cannot apply are not displayed

## What

Owner ruling: a preset, generation or sampling control that cannot apply to the connected provider and model is not displayed, and no not-honoured list or stale readout appears. Stored values stay untouched and unsent. Chat warnings for a dropped control the model does not state are not announced.

## Why

Showing controls that cannot apply confuses people.

## Done when

One capability check decides every such control on every surface, empty sections render nothing, the stale readout and not-honoured copy are removed, D68 and D41 are amended, and component tests show a knob rendering for a provider that honours it and absent for one that does not.

## Evidence

Filled at landing: what ran and where its output is.
