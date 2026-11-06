---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: client
plan: cross-surface-consistency
---

# A failed delete on Databank and Preset moves focus to the neighbour because the sync wiring closes the dialog first

## What

On Databank and Preset, close the delete dialog only after the delete succeeds, so a failed delete keeps focus where it was.

## Why

The sync wiring closes the dialog first, so focus moves to the neighbouring row before the delete fails. The user then reads the failure from the wrong place.

## Done when

A component test fails a delete on Databank and on Preset and finds focus still on the control that opened the dialog. A successful delete still moves focus to the neighbour.

## Evidence

Filled at landing: what ran and where its output is.
