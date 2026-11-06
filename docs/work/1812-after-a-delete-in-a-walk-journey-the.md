---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: testing
plan: surface-walk
---

# After a delete in a walk journey, the walker asserts focus is not on body and no read of the deleted id follows

## What

After a delete in a walk journey, make the walker assert that focus is not on the page body and that no read of the deleted id follows.

## Why

The focus drop after a delete and the 404 from a read of a deleted preset are one class of defect, and no walk step checks for either.

## Done when

The walker fails a journey that leaves focus on the body or reads the deleted id after a delete. A planted control journey that does both fails the check.

## Evidence

Filled at landing: what ran and where its output is.

Why: C5 and the deleted-preset `preset.get` 404 are one class. Done when a planted control fails the check.
