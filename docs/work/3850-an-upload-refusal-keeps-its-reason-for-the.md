---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: client
lane: wt/agent-a7af6003da75d8e56
plan: unwired-code
---

# An upload refusal keeps its reason for the caller

## What

uploadAsset parses the refusal body and throws UploadRefusedError with the sentence only (packages/client/src/data/upload-asset.ts:51-53); the reason code is sent and never read.

## Why

A sent field counts only when the receiver reads it. A caller cannot tell a wrong media type from an oversized file.

## Done when

UploadRefusedError carries the reason, each upload caller branches on it where the copy differs, and pnpm unwired codes lists none of the asset upload codes.

## Evidence

Filled at landing: what ran and where its output is.
