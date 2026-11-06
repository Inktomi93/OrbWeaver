---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: testing
---

# WebKit flake in platform-history-pagination at 1280x900 flat

## What

Find why platform-history-pagination times out in WebKit at 1280x900 flat, and remove the cause without raising the timeout.

## Why

The flake is not WebKit-only. At load about 16, one Chromium run of tests/client/features/chat/components/platform-history-pagination.suite.ct.tsx exited 1 (its failing assertion was not captured), and the next run passed 28 of 28. The suite was edited three times on the day of that run (433b3b84d4, 7222dd70f7, 193a6877e8), so the earlier line 114 sighting no longer points at the same statement.

## Done when

The suite passes repeated consecutive WebKit and Chromium runs under whole-suite load at both sizes.

## Evidence

Second run output: 28 passed (1.9m). The first run died with exit 1 and its output was truncated by the tool.
