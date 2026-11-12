---
kind: plan
status: active
updated: 2026-11-12
rank: 11
---

# Snap never writes a secret to disk, argv or a trace

## Goal

A token or password that passes through a snap run is masked in argv, artifact names, logs, crash output and traces.

## Shape

Close each open leak in the snap wrapper and its helpers, then add one test that drives a run with a planted secret through every output and finds it nowhere.

## Rejected

Masking by substring of short values, which scrubs common words.

## Coupled sites

The disk-safe argv and private values helpers.

## Test plan

A planted secret per input door, searched for in every artifact the run writes.
