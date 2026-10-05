---
kind: bug
status: open
updated: 2026-10-05
priority: P1
area: inference
---

# Idle trips are tested on every wire

## What

The idle-trip classification has tests for openai-compat and agent-sdk only (tests/inference/roles/side-gen.test.ts). anthropic-messages/chat.ts:297, google/chat.ts:68 and google/embed.ts:110 use turnAbortSignal with no idle-trip test, and no unit test checks that isIdleTrip finds a trip down a cause chain or that an abort-named wrapper still classifies as server (kit/error-classify.ts:168-169). Found by the inference round 2 review.

## Why

The ruling says every wire classifies an idle trip the same way; three wires are unproven.

## Done when

Each wire that uses turnAbortSignal has an idle-trip test asserting a retryable server error and a caller cancel asserting aborted, plus a unit test for the cause-chain walk.

## Evidence

Filled at landing: what ran and where its output is.
