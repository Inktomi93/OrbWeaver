---
kind: tooling
status: doing
updated: 2026-10-08
priority: P1
area: verification
lane: codex/ci-static-envelope
---

# Allow full CI qualification to finish with visible progress

## What

Align the CI static job deadline with full tooling qualification. Stream existing verification output during hosted execution.

## Why

The hosted job cancels active tooling proof before qualification completes. Buffered output hides the current test and progress.

## Done when

Full tooling qualification has a sufficient bounded outer deadline and visible progress. Focused tests preserve qualification authority and existing child budgets.

## Evidence

Filled at landing: what ran and where its output is.
