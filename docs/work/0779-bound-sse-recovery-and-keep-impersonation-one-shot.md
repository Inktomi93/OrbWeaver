---
kind: bug
status: doing
updated: 2026-10-07
area: transport
lane: codex/sse-reliability
---

# Bound SSE recovery and keep impersonation one-shot

## What

Separate replayable multiplex recovery from one-shot impersonation. Bound retries and opening deadlines. Cancel owned requests and preserve committed parser cursors.

## Why

Automatic subscription recovery can restart generation or revive a closed connection.

## Done when

Prove timer and parser failure paths, native HTTP reconnect and cancellation, and generation count one across impersonation connection failures. Preserve authentication and room authorization.

## Evidence

Filled at landing: what ran and where its output is.
