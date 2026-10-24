---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: inference
plan: restoration-register
---

# Pure recall and rerank rules live in @orb/kit with unit tests

## What

computeBridge, formatMemory, buildRecallQuery, inLiveWindow, the rerankPick name and ambiguity rules, applyRerank's unscorable and omitted ordering and rejection propagation, and the openai-compat minimum-window refusal are pure rules with no door, so they have no unit home.

## Why

The layer table puts pure logic in unit tests in @orb/kit and @orb/contracts; a test-only door export is banned, and driving pure rules through the composed root is the expensive layer for cheap permutations.

## Done when

Each pure rule moves to @orb/kit (or @orb/contracts where it is a contract rule) behind its existing door, the server imports it from there, and a unit test covers the reference cases with a defect control; no production export exists only for tests.

## Evidence

Filled at landing: what ran and where its output is.
