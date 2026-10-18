---
kind: bug
status: open
updated: 2026-10-18
priority: P1
area: tooling
plan: test-foundation
---

# Stopping a structure run leaves its semantic inventory worker running

## What

SIGTERM to the verify CLI process of a check:structure run does not reach its native semantic-inventory worker. After claude-b stopped a focused caught-failure-ownership run, its worker kept running at 100% CPU and 5.4 GB for over an hour until it was found and killed by hand.

## Why

Every stopped or timed-out check can leak a multi-gigabyte worker, which quietly starves the shared host and later runs.

## Done when

Stopping the verify CLI (SIGTERM, and the tool's own timeout) terminates and joins every inventory worker it started, proven by a test that stops a run mid-extraction and asserts no worker process survives.

## Evidence

Filled at landing: what ran and where its output is.
