---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# Index jobs say how many rows were skipped for a disabled account

## What

The index job copy calls every skipped row already up to date, and `ingestSummary` never prints the databank `skipped` count the server now returns.

## Why

An admin reading the result cannot tell that rows were left out because an account is disabled.

## Done when

The job result names the skipped count from a production copy module, with a component test that feeds a result with skipped rows.

## Evidence

Filled at landing: what ran and where its output is.
