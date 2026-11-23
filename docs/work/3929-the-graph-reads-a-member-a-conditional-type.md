---
kind: tooling
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# The graph reads a member a conditional-type check names

## What

A conditional type whose check names a member, such as T extends { readonly x: string } ? A : B, reads that member for the type system, and the compiler breaks when it is deleted. The graph does not follow that check, so the member stays member-untouched. The delete trial's planted readers in tests/tooling/unwired/graph-trial.int.test.ts rely on the gap.

## Why

A member only a conditional check reads is reported untouched, and the delete trial refutes it.

## Done when

A member an object-literal pattern in a conditional type's extends clause names is a key use, like a constraint; a planted case goes red without it; the trial's planted readers move to a shape the graph still cannot see, or the trial cases are rebuilt on another reader.

## Evidence

Filled at landing: what ran and where its output is.
