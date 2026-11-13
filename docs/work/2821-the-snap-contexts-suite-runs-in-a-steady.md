---
kind: tooling
status: doing
updated: 2026-11-13
priority: P3
area: tooling
lane: wt/agent-a274f499e5218974a
plan: checked-law
---

# The snap contexts suite runs in a steady time

## What

`tests/tooling/snap/ops/contexts.int.test.ts` takes about one second on some runs and four to five on others on one commit, against a five second case limit, and has timed out on main.

## Why

A case that sits at its limit reads as a product red under load.

## Done when

The cause of the slow runs is named from a profile of a slow run and removed, and the file's slowest case stays under half its limit across ten runs at load; no limit is raised.

## Evidence

Filled at landing: what ran and where its output is.
