---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: chat
plan: unwired-code
---

# Databank rerank degrade is wired or its hook removed

## What

onRerankUnavailable in packages/server/src/domain/chat/contract/context.ts:564 is unused; the databank rerank degrade path is not wired.

## Why

An unused hook hides whether a failed rerank degrades or breaks.

## Done when

A failed rerank degrades to unranked retrieval through the hook with a test, or the hook is deleted.

## Evidence

Filled at landing: what ran and where its output is.
