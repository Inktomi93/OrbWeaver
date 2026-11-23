---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# A tree generic's method that stores its argument and returns a count or the value pairs both ways

## What

The method-syntax rule in tooling/src/unwired/graph/variance.ts treats a method whose result is a primitive or names the generic's type parameter as computed from its argument, so a tree generic with a push that returns a count or an add that returns the value pairs forward only.

## Why

Such a method stores the value, so its members are read later; the forward-only pairing gives a false write-only. No live instance exists yet.

## Done when

A storing method of a tree generic pairs both ways, a comparing method still does not, and planted cases for both are red without the change.

## Evidence

Filled at landing: what ran and where its output is.
