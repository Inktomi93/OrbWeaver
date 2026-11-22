---
kind: tooling
status: open
updated: 2026-11-22
priority: P2
area: tooling
plan: unwired-code
---

# The graph reports dead locals, parameters and imports

## What

The graph has no dead-local fact: a local gets holder and local edges, so reach cannot tell a local nothing reads. The compiler reportsUnnecessary diagnostics list such locals, parameters and imports, and graph-trial lists them as graph-unjudged.

## Why

One engine judges every unit (D357); a dead local the graph cannot see is left to a separate compiler pass.

## Done when

A bucket reports locals, parameters and imports nothing reads, judged with the same role rules as members; the graph-trial control reports no graph-unjudged rows on the real tree, or lists each with its reason; planted cases proven red.

## Evidence

Filled at landing: what ran and where its output is.
