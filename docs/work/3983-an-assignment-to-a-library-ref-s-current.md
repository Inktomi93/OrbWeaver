---
kind: tooling
status: open
updated: 2026-11-23
priority: P3
area: tooling
plan: unwired-code
---

# An assignment to a library ref's current value credits its tuple

## What

In the unions scan, a literal assigned to the current value of a library ref typed over a union (a React ref whose type argument is a tuple's member type) reaches no slot, so it builds no member; the 3921 real-tree triage found two such rows and a planted probe reproduces it.

## Why

A member built only this way reads as unwired, a false finding.

## Done when

A planted ref typed by a tuple's member type credits the literal assigned to its current value, a twin ref over another tuple stays uncredited, and both are red without the change.

## Evidence

Filled at landing: what ran and where its output is.
