---
kind: tooling
status: open
updated: 2026-11-23
priority: P2
area: tooling
plan: unwired-code
---

# Graph CLI tests hold under a busy box

## What

On a loaded box the graph-trial and graph-census refusal cases, which spawn the CLI, run past the default per-test timeout, and the graph-session case for a compiler that dies mid-run can see the broken-pipe write error before the end-of-input read, so it gets EPIPE where it expects the unexpected end of input. Both passed alone and failed in a full unwired run beside other work.

## Why

A test that goes red under load teaches lanes to read reds as contention and hides a real failure behind them.

## Done when

The CLI-spawning cases carry the slow tag or a timeout sized to a spawn, the compiler-death case asserts the failure the session guarantees whichever pipe end sees the death first, without accepting a wrapped error, and the full unwired suite passes beside a parallel lint run.

## Evidence

Filled at landing: what ran and where its output is.
