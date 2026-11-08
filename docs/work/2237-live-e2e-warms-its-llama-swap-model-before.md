---
kind: tooling
status: open
updated: 2026-11-08
priority: P3
area: testing
---

# Live e2e warms its llama-swap model before the first turn

## What

Live e2e specs send their first turn to the llama-swap endpoint, which may have unloaded the model by TTL, so the turn waits out a cold boot of minutes and the spec's reply wait gives up first.

## Why

A cold boot reads as a hung turn and turns a live run red for a reason outside the case.

## Done when

The live e2e global setup warms the selected llama-swap model and waits for its health before the first spec, and a live run started with the model unloaded passes.

## Evidence

Filled at landing: what ran and where its output is.
