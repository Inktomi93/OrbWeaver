---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: tests
lane: wt/agent-a70dd9d31997dbde4
plan: test-foundation
---

# A committed test pins the image decompression-bomb caps through both doors

## What

Add a committed test that sends an over-cap image through each caller of `isAllowedImageBuffer` (`packages/server/src/infra/network/image-guard.ts`): background materialization, inline reply image storage and plugin net egress.

## Why

The dimension, pixel and byte caps protect the server only when every caller applies them. No test reaches `isAllowedImageBuffer` or `ImageRejectedError`, so a caller can drop the guard unseen.

## Done when

For each of the three callers, an over-dimension, an over-pixel and an over-byte image is refused with `ImageRejectedError` or the caller refusal. The test fails when a caller skips the guard.

## Evidence

Filled at landing: what ran and where its output is.
