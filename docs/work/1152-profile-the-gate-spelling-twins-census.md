---
kind: work
status: open
updated: 2026-10-19
priority: P3
---

# Profile the gate-spelling-twins census

## What

The gate-spelling-twins census now takes 1300 to 2000 s under load, against about 277 s when its test was written. It runs each gate's proof door once per respelled form, with a full policy pass per example.

## Why

A slow census forced a raised test budget and makes the suite expensive in CI; the time is not yet attributed.

## Done when

Profiled to its cause (policy pass, fact setup or the per-twin proof call); the cost is cut at the cause with identical census output, and the test budget is lowered to match.

## Evidence

Filled at landing: what ran and where its output is.
