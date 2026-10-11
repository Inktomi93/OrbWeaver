---
kind: bug
status: open
updated: 2026-10-11
priority: P3
area: connection
---

# The connection test is bounded by the chat idle timeout

## What

inspectOpenAiCompatEndpoint (packages/inference/src/backends/openai-compat/diagnostics.ts) runs with only the tRPC request signal; chat wraps its call in turnAbortSignal(features.requestTimeoutMs) (chat.ts:528). A hung endpoint holds the test until undici's header timeout or a client abort. The test is also not wrapped in woken(), so a sleeping vLLM row can read red while chat would wake it.

## Why

A connection test should fail as fast as chat would and wake a sleeping engine the way chat does.

## Done when

The test uses the connection's requestTimeoutMs idle bound and the same wake path as chat, with a test for a hung endpoint.

## Evidence

Filled at landing: what ran and where its output is.
