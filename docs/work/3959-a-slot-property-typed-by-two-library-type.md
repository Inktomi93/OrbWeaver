---
kind: tooling
status: doing
updated: 2026-11-24
priority: P3
area: tooling
lane: wt/agent-a8188e6e4871fd1c3
plan: unwired-code
---

# A slot property typed by two library type parameters is not opaque

## What

withoutNullish in tooling/src/unwired/graph/flows.ts keeps a type parameter only when exactly one constituent is left, so a property typed by a union of two library type parameters is opaque and its held value is never sent.

## Why

The value's members stay untouched though the library holds them.

## Done when

A planted case with two type parameters sends the held value, with a negative twin, and is red without the change.

## Evidence

Filled at landing: what ran and where its output is.
