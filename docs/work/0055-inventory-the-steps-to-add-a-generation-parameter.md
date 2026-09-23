---
kind: work
status: open
updated: 2026-09-23
priority: P3
area: preset
---

# Inventory the steps to add a generation parameter and propose bounded fixes

## What

List every step and file that a new preset generation parameter needs, from the contract to the preset
editor and the provider request body. Find the real duplication and coupling. Propose bounded fixes for the
owner to pick from. Presets keep owning generation settings, and the connection and provider boundaries do
not change.

## Why

The preset and parameter system is harder to extend than the registry contributions. Measure the cost
before any generalization.

## Done when

A design under `docs/plans/` lists the steps with file paths, names the duplication, and offers bounded
options. The owner picked one, and its build items are filed.

## Evidence

Filled at landing: what ran and where its output is.
