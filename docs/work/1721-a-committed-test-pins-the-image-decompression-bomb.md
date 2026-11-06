---
kind: work
status: open
updated: 2026-11-06
priority: P3
area: tests
plan: test-foundation
---

# A committed test pins the image decompression-bomb caps through both doors

## What

Add a committed test that pins the image decompression-bomb caps through both doors that accept an image.

## Why

The caps protect the server only when every door applies them, and one test over both doors keeps a later change in either door from dropping a cap.

## Done when

The test sends an over-cap image through each door and sees a refusal from both. It fails when either door skips its cap.

## Evidence

Filled at landing: what ran and where its output is.
