---
kind: tooling
status: open
updated: 2026-10-24
priority: P3
area: tests
---

# The private-corpus refusal suite spawns the CLI thirty-two times

## What

`tests/support/node/corpus-private.int.test.ts` proves the private-corpus admission refusals by starting the corpus CLI as a child process once per argument shape, about thirty-two spawns under `nice`, against a 96 s test budget. Alone on a quiet box it takes about 80 s; under the load every lane battery produces it times out, and today it was the one red in nearly every verifier's full run (reported at 96 s, 106 s and 212 s). Each spawn refuses on its arguments before any database or owner code runs, so the thing under test is the admission function, not the process.

## Why

A suite that reds on load in every full run teaches lanes to ignore reds, and a wall-clock budget written for a quiet box is a lie on a contended one.

## Done when

The argument-shape refusals run in-process against the admission function the CLI calls (one real spawn remains to prove the CLI wires it, the positive control); the suite runs under 10 s alone and carries no timeout above the project default; the full lane battery passes it under load.

## Evidence

Filled at landing: what ran and where its output is.
