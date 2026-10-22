---
kind: bug
status: open
updated: 2026-10-22
priority: P3
plan: test-foundation
---

# Folder import planner edges at non-served caps

## What

The framing reserve subtracts framing for up to maxFiles of the largest parts whatever a batch holds, so if framing reached the total the planner falls back to one upload per file instead of refusing; a file larger than the framed budget is emitted alone instead of skipped and would 413. Both are unreachable at the served caps. The use-library-import.ts header still names planTreeImport; no test drives the hook's replan branch.

## Why

Planner limits should refuse clearly rather than degrade or 413 when caps change.

## Done when

The reserve scales with each batch, an over-budget file is skipped with a reason, the header names planServedTreeImport, and a test drives the persona replan branch.

## Evidence

Filled at landing: what ran and where its output is.
