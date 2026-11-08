---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: tooling
lane: wt/agent-aada102e03c183697
plan: test-foundation
---

# doc land and the board writes have tests for each unwind guard

## What

Bundle from the lane G review: no test fails if the index-lock pre-check in doc land is removed; landStaged's post-write unwind has no test; --commit board writes still leave files written when the commit fails.

## Why

The unwind that 2114 built is only as good as the tests that fail when a guard is removed.

## Done when

Removing the index-lock pre-check or landStaged's unwind turns a test red, and a failed --commit board write leaves every file as it was, with a test.

## Evidence

Filled at landing: what ran and where its output is.
