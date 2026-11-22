---
kind: tooling
status: blocked
updated: 2026-11-22
priority: P2
area: tooling
blocked: on 3882
plan: unwired-code
---

# One write-access reader covers every write form the scans see

## What

classify.ts roleOf and occurrences.ts isWrittenName decide writes separately and both call ++, --, destructuring-assignment targets, for-of targets and delete reads; they also disagree on element-access writes.

## Why

A bumped-only member reports as read and a member written by destructuring loses its write, so dead fields hide and live ones report never-written.

## Done when

One reader on the 7.1 AST at index time handles every listed form, both old homes are deleted, a fixture per form fails before the change, and the fields scan's tests pass.

## Evidence

Filled at landing: what ran and where its output is.
