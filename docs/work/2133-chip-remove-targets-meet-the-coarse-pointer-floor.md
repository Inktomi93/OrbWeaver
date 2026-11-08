---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: ui
lane: wt/agent-a53049a5655c3c496
plan: cross-surface-consistency
---

# Chip remove targets meet the coarse-pointer floor

## What

The combobox chip remove target is a 24px square at every pointer. D62 sets a higher floor for a coarse pointer. Give the remove mark a coarse-pointer target that meets that floor without covering the next chip or the input, for example by widening the chip gap at a coarse pointer.

## Why

A remove mark under the coarse floor is hard to hit on a phone, and growing it into its neighbours deletes the wrong keyword.

## Done when

At a coarse pointer the remove target meets the D62 floor, a tap just inside the next chip or the input still hits that control, and a CT measures both.

## Evidence

Filled at landing: what ran and where its output is.
