---
kind: tooling
status: doing
updated: 2026-11-10
priority: P3
area: tooling
lane: wt/agent-a461ab89d9d634803
plan: cross-surface-consistency
---

# Audit proofs account per subject so an excluded subject cannot hide behind judged

## What

The relational audit proofs count candidates per rule, so an excluded subject next to a clean one can still read as judged.

## Why

A silent proof that hides an excluded subject reads as a rule that looked at it.

## Done when

Each subject carries its own disposition, and a planted excluded subject beside a clean one fails a judged proof.

## Evidence

Filled at landing: what ran and where its output is.
