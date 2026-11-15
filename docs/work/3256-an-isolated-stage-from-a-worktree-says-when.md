---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: snap
---

# An isolated stage from a worktree says when it copied no data

## What

seedStageData in tooling/src/snap/ops/stage-source.ts copies the checkout's own data/db, and a lane worktree has none. The stage then boots a first-boot database with dbProvenance null, and snap prints nothing about it.

## Why

A drive on that stage reads as evidence about real data when it ran on an empty library. This cost a round trip on the matrix: the empty chat list looked like a product or instrument fault.

## Done when

A stage that copied no db prints one line naming the missing source and the --stage-db remedy, and the band row carries that state for --stage-status.

## Evidence

Filled at landing: what ran and where its output is.
