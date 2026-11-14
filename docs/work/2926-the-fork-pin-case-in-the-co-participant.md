---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# The fork pin case in the co-participant render-floor suite runs near its timeout

## What

The case "a fork carries the held pin's face to a member seated only in the fork, and the origin's pin grants that member nothing" in `tests/server/domain/chat/verbs/co-participant-render-floor.int.test.ts` takes several seconds alone and times out under ordinary load in multi-file runs, including at one worker. It forks a room, admits a member and fetches every variant of one blob several times.

## Why

A timeout here reads as a gate regression in a security suite and costs a rerun to tell apart.

## Done when

The case is tagged `slow` from `tooling/src/floor/testing/test-tags.ts` with its runtime proven, or made faster, and it passes in a multi-file run at default workers under load.

## Evidence

Filled at landing: what ran and where its output is.
