---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: server
lane: wt/agent-ac4fec0a6f2153940
plan: cross-surface-consistency
---

# A large folder dry run does not hold the interactive lane

## What

An import dry run now runs on the one-wide interactive lane. Within the upload limits, a large batch can hold that lane while it collects, delaying other interactive work.

## Why

D209 keeps interactive work from waiting behind long work, and a big preview can become long work.

## Done when

The time a dry run holds the lane is measured at the upload limits, and it is bounded or the risk is recorded with its reason.

## Evidence

Filled at landing: what ran and where its output is.
