---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: inference
plan: typed-enforcers
---

# Provider usage shapes derive from the one token usage schema

## What

cacheReadTokens and its siblings are spelled in tokenUsageSchema (packages/contracts/src/inference/usage.ts), in ProviderTurnUsage and ProviderCacheLog (packages/inference/src/contract/http.ts) and in an interface and schema pair in packages/contracts/src/chat/messages.ts. Stats holds signed sums and may need its own shape.

## Why

Usage counts are spelled several times and a renamed or added count drifts.

## Done when

Each usage shape derives from tokenUsageSchema by Pick or extend, or states in its header why it is a different concept; the Stats shape is judged with the reason recorded; inference and chat usage tests pass.

## Evidence

Filled at landing: what ran and where its output is.
