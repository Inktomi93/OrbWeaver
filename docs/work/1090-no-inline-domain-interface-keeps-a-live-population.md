---
kind: tooling
status: doing
updated: 2026-10-19
priority: P3
area: tooling
lane: wt/agent-acb14f15173490df8
plan: test-foundation
---

# no-inline-domain-interface keeps a live population or is deleted

## What

Native placement owns every authored server-domain declaration, so no-inline-domain-interface judges only generated domain interfaces, and none exist. Its case in type-home-declaration.test.ts can only assert that it judges nothing.

## Why

A gate with no possible subject costs runtime and reads as coverage it does not give.

## Done when

The gate is deleted with its catalog row and tests, or it is given a population native lint does not own, with a planted control.

## Evidence

Filled at landing: what ran and where its output is.
