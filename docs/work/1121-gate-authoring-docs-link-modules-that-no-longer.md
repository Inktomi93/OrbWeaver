---
kind: work
status: doing
updated: 2026-10-19
priority: P3
lane: wt/agent-acb14f15173490df8
---

# Gate authoring docs link modules that no longer exist

## What

tooling/src/verify/gates/GATE-AUTHORING.md lines 89, 292 and 293 link ./gate-modernization.ts and ./policy-family-readers.ts, and TS-MORPH-CAPABILITIES.md line 238 names gate-modernization; neither module exists after the gate moves.

## Why

A rule table that points at a deleted module sends the next gate author to nothing.

## Done when

Each statement names its live successor or is deleted, and no link in either doc points at a missing file.

## Evidence

Filled at landing: what ran and where its output is.
