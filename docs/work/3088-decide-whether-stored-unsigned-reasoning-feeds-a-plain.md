---
kind: decision
status: open
updated: 2026-11-15
priority: P2
area: inference
---

# Decide whether stored unsigned reasoning feeds a plain-text replay

## What

A reply's reasoning is stored for display. Decide whether an unsigned reasoning block may be replayed as plain text to a provider that cannot take signed reasoning, and on which step.

## Why

The prompt pass reads no reasoning; a replay step would be the only path reasoning reaches a prompt.

## Done when

A recorded ruling, and either a work item for the step or a closed item.

## Evidence

Filled at landing: what ran and where its output is.
