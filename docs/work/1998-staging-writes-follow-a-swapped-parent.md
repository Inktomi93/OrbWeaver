---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: server
lane: wt/agent-a05d401fe0a7ad9c7
plan: test-foundation
---

# Staging writes follow a swapped parent

## What

A timed local actor with rights inside the staging root can redirect server writes and one delete by swapping a parent directory between mkdir and write. Decide whether to bound the window or record it as accepted.

## Why

The read side is closed by digest, and the write side has no such anchor.

## Done when

A recorded decision with its actor, and a fix or a stated acceptance.

## Evidence

Filled at landing: what ran and where its output is.
