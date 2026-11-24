---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-a8188e6e4871fd1c3
plan: unwired-code
---

# A wrapped, nested or list conditional check keys the argument's members

## What

tooling/src/unwired/graph/constraints.ts keys a naked conditional check's argument, but a wrapped check, a list check over the argument, and a conditional nested in a branch key only the pattern's own members.

## Why

The compiler checks the argument in each shape, so deleting the member breaks the build while the graph calls it untouched. The delete trial's planted readers rely on the wrapped form today.

## Done when

constraints.ts follows each shape to the argument, a planted case per shape is red without it, and the trial's planted readers move to a shape the graph still cannot see or to another reader.

## Evidence

Filled at landing: what ran and where its output is.
