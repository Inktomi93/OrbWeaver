---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: chat
plan: test-foundation
---

# Card parity test gaps

## What

From the review of the card parity branch. No unit test covers the plain-content verdict table. The notice's navigation is shown by store reads only, not by the control it lands on at desktop and phone sizes. The card-frame route helper is copied by hand in several component test files. A comment in `packages/client/src/features/chat/components/ghost-message-row.tsx` cites a component test that no longer exists, so nothing shows that prose streaming below a closed card leaves its frame mounted.

## Why

The verdict table and the no-remount rule are the facts most likely to drift.

## Done when

A unit test covers every row of the verdict table. A component test lands on the named control at both sizes. The route helper has one home in the test kit. A component test shows prose streaming below a closed card never reloads its frame, and the comment cites it.

## Evidence

Filled at landing: what ran and where its output is.
