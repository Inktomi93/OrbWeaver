---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# Nullish and logical-or operands fill a slot like conditional branches

## What

The graph pairs each branch of a conditional returned into an opaque slot, but the operands of a nullish-coalescing or logical-or expression are not paired, so a checked view returned that way stays write-only.

## Why

The same collapse argument applies: an unknown left operand makes the whole expression unknown, so the right operand's literal reaches the slot.

## Done when

A planted nullish-coalescing literal returned into unknown sends its view, a logical-or twin does the same, and both are red without the rule.

## Evidence

Filled at landing: what ran and where its output is.
