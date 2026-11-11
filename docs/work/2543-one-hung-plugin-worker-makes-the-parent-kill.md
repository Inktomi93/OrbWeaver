---
kind: bug
status: open
updated: 2026-11-11
priority: P2
area: security
---

# One hung plugin worker makes the parent kill the broker that serves every owner

## What

All plugin workers run under one broker process. When a command does not answer within the parent's timeout, the parent kills the whole broker (packages/server/src/infra/plugin-host/process-runtime.ts), and every owner's resident plugins fail until it restarts. Measured by the security lane with production timers: a snippet that hung a worker caused the kill at the timeout and a bystander's resident plugin failed from then on. The known ways for a guest to hang a worker are closed by the CPU window work; the kill itself is still owner-blind. Source: the leg-six section of the security lane report under reports/lanes.

## Why

The sandbox bounds one guest, but the recovery for a guest that escapes the bound punishes everyone. Any future hang bug becomes an outage for every owner, triggered by one member.

## Done when

A worker that does not answer is ended alone, with its own plugin instance failed and reported, and other workers keep serving; the broker is killed only when the broker itself does not answer. A real-guest test hangs one worker by a test-only native stall at the external edge and shows a second owner's resident plugin still answers. A recorded decision states the recovery order.

## Evidence

Filled at landing: what ran and where its output is.
