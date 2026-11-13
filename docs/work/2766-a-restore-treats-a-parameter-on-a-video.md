---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: assets
plan: import-robustness
---

# A restore treats a parameter on a video type as it does on an image type

## What

A bundle restore refuses a video type that carries a parameter, such as a codecs parameter on MP4, and normalizes the same shape on an image type to the bare type.

## Why

The two families answer the same input differently for no stated reason, so a valid backup can lose a video.

## Done when

Both families normalize a parameter to the bare type, or both refuse it, with a test through the production restore.

## Evidence

Filled at landing: what ran and where its output is.
