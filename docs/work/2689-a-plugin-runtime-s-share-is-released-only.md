---
kind: bug
status: doing
updated: 2026-11-12
priority: P3
area: plugins
lane: wt/agent-a84eabc3e8d8f0a49
---

# A plugin runtime's share is released only after its last answer is queued

## What

The answer to a snippet, a dispose or a failed create is sent after the runtime's share of the IPC queue is released. That answer, and any bytes still queued on the released share, are charged to whichever runtime takes the share next, which can belong to another owner. The effect is bounded by one share until the queue drains; the next holder can see a retryable channel-full refusal meanwhile. Evidence: the security review of the lane's fifteenth leg under reports/review.

## Why

D348 rules that no runtime's frames take another's room, and release order lends a share's room away for a moment.

## Done when

A share is released after its runtime's last answer is queued and its queued bytes have drained or are accounted to it alone, with a test at the broker layer that fails when a share is released before its runtime ends.

## Evidence

Filled at landing: what ran and where its output is.
