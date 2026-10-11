---
kind: tooling
status: open
updated: 2026-10-11
priority: P3
area: tooling
---

# Knip pattern list duplicates the negative liveness patterns

## What

Left over from item 476: knip.ts patternList duplicates patternsOf in tooling/src/verify/ops/knip-negative-liveness.ts. Derive one from the other.

## Why

Two copies of the same pattern list drift; 476 was closed with this clause undone.

## Done when

One pattern list, imported by both sites.

## Evidence

Filled at landing: what ran and where its output is.
