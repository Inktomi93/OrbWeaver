---
kind: tooling
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# The flow walk pairs a generic's type arguments by variance

## What

flows.ts #sameGeneric pairs the type arguments of two instances of one generic as if the value always flows forward. In Options<V>, where V is a function parameter, the value flows the other way, so a client vars twin of a router input never writes through mutationOptions. Fixing it touches every generic pairing.

## Why

A wrong flow direction credits writes and reads to the wrong side, both ways. It blocks the client vars recognition 3922 still needs.

## Done when

Pairing follows each type parameter's variance; a planted mutationOptions vars twin writes the router input's keys; every existing generic-pairing case still passes; each new case fails without the change.

## Evidence

Filled at landing: what ran and where its output is.
