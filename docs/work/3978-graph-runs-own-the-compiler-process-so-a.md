---
kind: tooling
status: doing
updated: 2026-11-24
priority: P2
area: tooling
lane: wt/agent-a928fb0eea0de1b10
plan: unwired-code
---

# Graph runs own the compiler process so a crash names its exit code and signal

## What

When the compiler child of a graph run dies, the TypeScript API reports only an unexpected end of input with an unknown reason, and the run cannot say whether the compiler exited with a code or was killed by a signal. The 7.1 package does not export its process-argument helpers, and its sync client refuses socket connections, so the tool cannot spawn the compiler itself; Node's public child_process diagnostics channel hands the API's ChildProcess to a subscriber scoped around the API's construction.

## Why

A dead-row trial crashed mid-run with no out-of-memory record, and without the code or signal the next crash cannot be diagnosed.

## Done when

The graph session captures the compiler's ChildProcess through a public route, a compiler that dies mid-run leaves a note naming its exit code or signal, the time and the phase, a planted kill case is red without it, and no private API member or unknown cast is used.

## Evidence

Filled at landing: what ran and where its output is.
