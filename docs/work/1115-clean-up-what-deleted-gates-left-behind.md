---
kind: tooling
status: open
updated: 2026-10-19
priority: P2
---

# Clean up what deleted gates left behind

## What

Gates deleted by 1041 still have traces in the tree: @orb-waive and @orb-waive-file markers naming a deleted gate id (mostly no-test-fabrication in tests/legacy, which the native successor does not scan and native ESLint never reads), rows for deleted gates in tests/tooling/gate-spelling-twins.baseline.json, and quoted ids in tooling, tests and eslint.config.js. Some quoted ids are legitimate: a native successor that keeps the gate's name, or a parity record. The gate catalog is regenerated.

## Why

A waiver for a gate that no longer exists is dead text that reads as a live exemption, and a baseline row for a deleted gate keeps a certification for nothing.

## Done when

A census of every deleted audit gate id classifies each remaining reference as live successor, parity record or dead; dead markers and baseline rows are removed; gate-spelling-twins and its baseline agree with the live gate set; legacy edits are comment-only under D320.

## Evidence

Filled at landing: what ran and where its output is.
