---
kind: bug
status: doing
updated: 2026-11-08
priority: P2
area: tests
lane: wt/agent-a081e2b19fc567c08
plan: test-foundation
---

# The testkit reads env functions without loading the operator .env

## What

The testkit harness imports its env functions through the module that loads .env, which is the root of the runner-side leak class. The CT runner loads the operator .env the same way. Give the testkit a door to the env functions that loads no file, and move both runners onto it.

## Why

Each new harness import through the loading module puts operator secrets back into a test process.

## Done when

Neither the CT nor the e2e runner process holds an operator .env value, checked by a test that starts each runner with a canary in .env, and a dependency rule refuses the loading module from testkit code.

## Evidence

Filled at landing: what ran and where its output is.
