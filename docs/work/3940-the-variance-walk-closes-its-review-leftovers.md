---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# The variance walk closes its review leftovers

## What

graph/variance.ts returns a raw partial result to a call made while another walk of the same symbol is in progress, before the declared in/out modifiers apply; it only over-credits. No planted case covers Object.values, structuredClone or an explicit in/out modifier. A generic declared inside a generic function may misalign type-parameter positions (unproven).

## Why

An unguarded path and untested rules regress silently.

## Done when

A cycle call applies the declared modifiers; planted Object.values, structuredClone and in/out modifier cases fail when their rule is reverted; the nested-generic suspicion is proved or closed with a case.

## Evidence

Filled at landing: what ran and where its output is.
