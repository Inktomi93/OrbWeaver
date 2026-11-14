---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: chat
---

# A summary stays stored when its edited scene no longer fits the summarizer window

## What

`collectTier0` in `packages/server/src/domain/chat/memory/generate/digests.ts` skips a block whose stored summary hash no longer matches and whose rewritten text cannot be fitted to the summarizer window (the token-guard skip). That skip neither stores a replacement nor invalidates the stored summary, so the summary built before the edit, and every longer summary above it, stays recalled. A blank re-summary already drops both.

## Why

The build has proven the stored summary stale by its hash mismatch, so recall keeps telling a scene as it read before the edit for as long as the block cannot be summarized.

## Done when

In a composed-root case an edited scene that cannot be fitted to the summarizer window leaves neither its own stored summary nor the longer summaries built from it in the memory view or the next prompt, and an unedited scene beside it stays.

## Evidence

Filled at landing: what ran and where its output is.
