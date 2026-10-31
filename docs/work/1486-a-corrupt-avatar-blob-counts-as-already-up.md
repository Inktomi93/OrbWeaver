---
kind: bug
status: open
updated: 2026-10-30
priority: P3
area: embeddings
---

# A corrupt avatar blob counts as already up to date in the image sweep

## What

A truncated or corrupt stored image (a 5-byte blob in review) does not stop the image embedding sweep, but it is counted as skipped (already up to date) rather than failed, so the owner never learns the picture is broken. Found reviewing item 1457.

## Why

Item 1457's reason names corrupt or deleted files; a corrupt one still hides.

## Done when

A corrupt blob is reported as a failed asset with its id and shown to the owner like a missing one, pinned by a server integration test through the composed root.

## Evidence

Filled at landing: what ran and where its output is.
