---
kind: bug
status: open
updated: 2026-10-19
priority: P1
---

# A const-key bracket access slips past agent-bridge-lock, no-raw-egress and persistence-boundary

## What

A computed member whose key is a const binding, x\[K] with const K = "\_\_orb" (and the same shape for the other gates' banned members), is not resolved to its literal, so agent-bridge-lock, no-raw-egress and persistence-boundary all miss it. Found by the 955 reader version table (reports/review/955-symbol-references.md). Security: route to security-executor.

## Why

A banned member reached through a const key is the cheapest bypass of three boundary gates; a spelling the gate cannot see is a working hole.

## Done when

Const keys resolve through staticMemberAccess's binding resolver for all three gates, with a red-first mustFlag row per gate and a near-miss mustPass (a let or reassigned key stays unresolved and is refused, not passed); the cost of the resolution is measured.

## Evidence

Filled at landing: what ran and where its output is.
