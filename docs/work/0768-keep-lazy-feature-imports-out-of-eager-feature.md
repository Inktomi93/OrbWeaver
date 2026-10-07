---
kind: bug
status: doing
updated: 2026-10-06
priority: P2
area: client
lane: main
---

# Keep lazy feature imports out of eager feature exports

## What

Correct ineffective dynamic imports in the preset editor and character provenance readout.

## Why

An eager export defeats the preset editor lazy boundary. A lazy readout duplicates an already eager chart dependency.

## Done when

The client build emits no ineffective dynamic import warnings. The preset editor remains separately loaded and its public entry renders the loading state. Affected component tests pass.

## Evidence

Filled at landing: what ran and where its output is.
