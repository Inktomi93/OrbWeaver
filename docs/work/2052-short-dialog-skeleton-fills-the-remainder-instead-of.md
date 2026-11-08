---
kind: bug
status: doing
updated: 2026-11-08
priority: P3
area: ui
lane: wt/agent-afb5bff2b14113d1d
plan: cross-surface-consistency
---

# Short-dialog skeleton fills the remainder instead of an exact box

## What

The New chat skeleton reserves an exact pixel box that a short dialog does not use, so first open at coarse landscape still grows by a row and a half.

## Why

A dialog that jumps after load reads as broken.

## Done when

First open at 844x390 coarse holds its height from skeleton to list, with a CT.

## Evidence

Filled at landing: what ran and where its output is.
