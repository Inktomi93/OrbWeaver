---
kind: bug
status: open
updated: 2026-11-15
priority: P2
area: snap
---

# A matrix cell that dies says which cell died

## What

When one cell's appearance row throws an instrument refusal, snapMatrixOnSession prints it as 'snap matrix discovery/planning failed' and stops the whole matrix. Cells after it never run.

## Why

The label points the reader at discovery, when discovery and planning had already passed. One refused cell also hides every later cell's verdict, so each run surfaces one blocker at a time.

## Done when

A cell's refusal is recorded as that cell's no-verdict result, with its id and branch. The other cells still run, and the matrix exits on the combined result.

## Evidence

Filled at landing: what ran and where its output is.
