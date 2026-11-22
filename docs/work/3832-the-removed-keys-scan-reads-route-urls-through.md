---
kind: tooling
status: open
updated: 2026-11-22
priority: P3
area: tooling
plan: unwired-code
---

# The removed-keys scan reads route URLs through the shared URL folding

## What

removed-keys keeps its own URL-prefix reader while the procedures scan folds route URLs through the checker; two readers of one concept.

## Why

Two route readers drift apart.

## Done when

removed-keys uses the procedures scan's URL folding after a case-by-case comparison recorded in the change's report, and its suite passes on the shared reader.

## Evidence

Filled at landing: what ran and where its output is.
