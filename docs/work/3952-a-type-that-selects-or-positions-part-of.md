---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# A type that selects or positions part of an alias credits only that part

## What

The unions slot reader in tooling/src/unwired/graph/union-slots.ts credits every tuple a type node names, including parts the type removes or does not select: Exclude and Extract over an alias, an indexed access on a key union, a setter keyed by a typed variable, a tuple type read for every element, and a mapped type that retypes properties. The readers are readSpelling, indexedProperty, ownBinding and propertySpellings.

## Why

These slots trace to a tuple the literal can never belong to, so they build a member nothing builds and hide a truly unwired member. Main behaves the same.

## Done when

A planted case per shape credits only the selected or positioned part, with a control that fails when the selection is removed, or a ruling names a shape read whole on purpose with its reason.

## Evidence

Filled at landing: what ran and where its output is.
