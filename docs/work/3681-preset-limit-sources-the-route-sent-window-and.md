---
kind: work
status: open
updated: 2026-11-20
priority: P3
area: preset
plan: cross-surface-consistency
---

# Preset limit sources: the route-sent window and the Ollama floor have no test

## What

Review findings on the preset limit sources change. The preset limits CT never mounts a route that sends the window, so the hidden context door and the sentByServer blank note are untested. The header at packages/inference/src/capability/floor.ts says the window stands, which is no longer true: on an Ollama native row with no trained maximum, the preset's Max context goes out as num_ctx without the floor in packages/contracts/src/inference/capability/reads.ts. The code-reviewer report for item 3670 lists the cases.

## Why

An untested branch can regress silently, and a wrong file header misleads the next author into keeping a behaviour that is gone.

## Done when

A CT case mounts a window-sending route and asserts the hidden door and the blank note. The floor.ts header states the current rule, and an Ollama native row with no trained maximum either keeps the floor or a ruling says why not, with a test.

## Evidence

Filled at landing: what ran and where its output is.
