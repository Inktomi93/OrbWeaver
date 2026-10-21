---
kind: bug
status: open
updated: 2026-10-21
priority: P2
area: server
plan: test-foundation
---

# Chat handoff barrier follows the domain template

## What

Hosted maintained node qualification reports a loose handoff-barrier.ts at the chat domain root. The source implements D332 room-work coordination, while the closed root vocabulary excludes this file. Evidence: reports/review/ci-1215-current/run-39620796838/.

## Why

The production implementation violates the domain template and prevents maintained node qualification.

## Done when

Move the implementation to its lawful domain home, update actual imports and subject declarations, and preserve handoff settlement behavior. Qualify the layout suite, affected native compiler programs and matching handoff controls without adding a root allowance.

## Evidence

Filled at landing: what ran and where its output is.
