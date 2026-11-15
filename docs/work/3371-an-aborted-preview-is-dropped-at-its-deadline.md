---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: regex
---

# An aborted preview is dropped at its deadline instead of requeued

## What

In onDeadline, drop a preview job whose signal is aborted instead of requeuing it.

## Why

An active preview whose panel unmounted is requeued after a deadline and runs its remaining entries for a panel that is gone (packages/client/src/lib/display-pass-runner.ts onDeadline and runRegexPreview). Code review of ee979313d0, Combined tip delta (reports/code-reviewer/-cb-review-regex-client.md in agent-a8071996f9c5e8978).

## Done when

An unmounted panel's active preview stops at its deadline and runs nothing more, shown by a test that unmounts mid-run.

## Evidence

Filled at landing: what ran and where its output is.
