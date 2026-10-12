---
kind: tooling
status: doing
updated: 2026-10-12
priority: P2
area: verify
lane: wt/agent-afe5353ae9ba0f311
---

# Waivable coordinates never end in whitespace

## What

waivableCoordinate can return a cut ending in a space (for example typeof globalThis & { \_\_x: ), which no @orb-waive marker can name. Item 899 trimmed it only inside no-test-fabrication. Fix it in waivableCoordinate so every gate that uses it can be waived, and drop the local trim.

## Why

A finding no marker can name is unwaivable in every gate that hits the shape.

## Done when

waivableCoordinate never returns leading or trailing whitespace, with a planted control, and the local trim is gone.

## Evidence

Filled at landing: what ran and where its output is.
