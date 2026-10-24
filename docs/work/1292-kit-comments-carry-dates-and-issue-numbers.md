---
kind: work
status: open
updated: 2026-10-24
priority: P3
area: tests
---

# Kit comments carry dates and issue numbers

## What

Comments across tests/support carry dates, issue numbers and incident history, which .claude/rules/comments.md and .claude/rules/writing.md forbid. Examples: tests/support/node/composed-real.ts, tests/support/iso/hit-extent-walk.ts, tests/support/browser/pixel-contrast.ts, tests/support/browser/touch-floor.ts.

## Why

A comment that tells history goes stale and hides the reason the code needs.

## Done when

Each such comment states only its non-obvious reason or is deleted; an rg for dates and issue-number patterns across tests/support comments finds none.

## Evidence

Filled at landing: what ran and where its output is.
