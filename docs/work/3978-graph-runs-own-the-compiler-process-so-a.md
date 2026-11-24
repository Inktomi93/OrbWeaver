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

When the compiler child of a graph run dies, the TypeScript API reports only an unexpected end of input with an unknown reason, and the API's own child process is private, so the run cannot say whether the compiler exited with a code or was killed by a signal. The 7.1 API exports resolveExePath and getAPIProcessArgs, and its client options accept a socket pipe, so the tool can spawn the compiler itself and connect over the pipe.

## Why

A dead-row trial crashed mid-run with no out-of-memory record, and without the code or signal the next crash cannot be diagnosed.

## Done when

The graph session spawns the compiler through the exported process arguments and connects in socket mode, a compiler that dies mid-run leaves a note naming its exit code or signal, the time and the step, a planted kill case is red without it, and no private API member or unknown cast is used.

## Evidence

Filled at landing: what ran and where its output is.
