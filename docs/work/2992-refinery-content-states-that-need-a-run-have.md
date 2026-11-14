---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: refinery
---

# Refinery content states that need a run have no short-landscape reach test

## What

The short-landscape reach cases cover the landing and an unrun session. A session with runs, and the apply outcome view, hold more controls under the same scroll owner and are not measured at that window.

## Why

The last control of the apply outcome is the terminal act and must be reachable on a phone held sideways.

## Done when

A component test at a short landscape phone size seeds a session with a rewrite run and an applied outcome, reaches the last control of each by scrolling the content region, and fails when the region does not scroll.

## Evidence

Filled at landing: what ran and where its output is.
