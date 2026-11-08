---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: chat
---

# Pin that a guided swipe leaves the target reply out

## What

No test fails when readsTarget becomes true for every guided swipe; only the rewrite path should read the target.

## Why

A mutation to the readsTarget condition passes the turn prompt input suite.

## Done when

The turn prompt input suite has a guided swipe case that fails under that mutation.

## Evidence

Filled at landing: what ran and where its output is.
