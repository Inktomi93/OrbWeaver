---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: regex
---

# The retrieval read analysis says so when it gives up at its depth cap or on a cycle

## What

regexCallReadsRetrieval judges scripts against the global macro registry, and analyzeExpansion in packages/kit/src/macro/cache-safety.ts returns no read when it stops at its depth cap or on a cycle, which its header says it does not do. No script reaches either today.

## Why

A script that reaches the cap would run with no retrieval while reading the memory or databank macro.

## Done when

The analysis answers that a read is possible when it stops early, and a kit test covers the cap and a cycle.

## Evidence

Filled at landing: what ran and where its output is.
