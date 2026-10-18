---
kind: bug
status: open
updated: 2026-10-18
priority: P2
area: tooling
plan: test-foundation
---

# byte-check-cast policy-conformance mustFlag case finds nothing on main

## What

On main (724c65684d), whole-corpus policy-conformance exits 2 with one failure: byte-check-cast mustFlag\[3] expects at least one effective finding and gets 0. Either the gate lost the recognition the planted case proves, or the case no longer plants a violation.

## Why

A must-flag control that stops flagging means the gate can silently pass the thing it exists to catch.

## Done when

The mustFlag case flags again through a real gate fix, or the case is corrected to plant a genuine violation with evidence that the gate still catches it; policy-conformance for byte-check-cast passes.

## Evidence

Filled at landing: what ran and where its output is.
