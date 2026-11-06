---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: server
plan: unwired-code
---

# The speaker reranker takes the turn's AbortSignal, so Stop during a rerank does not wait for the held answer

## What

Give SpeakerReranker.rerank the turn's AbortSignal and pass it from the speaker pick, so Stop during a rerank ends the call.

## Why

SpeakerReranker.rerank in packages/server/src/domain/chat/contract/arbitration.ts takes only a query, documents and an instruction. Stop cannot reach the provider call, so the turn waits for the held answer.

## Done when

A test starts a Smart speaker pick against a rerank that never answers, aborts the turn, and sees the pick end without waiting for the rerank.

## Evidence

Filled at landing: what ran and where its output is.
