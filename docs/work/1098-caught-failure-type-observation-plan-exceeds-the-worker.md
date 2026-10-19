---
kind: bug
status: doing
updated: 2026-10-19
priority: P1
lane: wt/agent-ad08a5ee972bd1e4d
---

# Caught-failure type-observation plan exceeds the worker heap on the client program

## What

The symbol-closure question in tooling/src/verify/lib/caught-failure-native.ts asks all six caught-failure properties (then, ok, kind, status, step, verdict) at every node and again at each nested step, plus type-argument and union-part questions, so the client native inventory worker plans past its heap and dies near 17 GB.

## Why

The client inventory worker cannot complete on a 16 GB runner, which blocks check:ledgers-fresh and the structure stage on main.

## Done when

A red-first plan-size bound on the caught-failure plan passes, the plan asks only what the caught-failure reader consumes, and the client inventory completes under 16 GB in a single-program run.

## Evidence

Filled at landing: what ran and where its output is.
