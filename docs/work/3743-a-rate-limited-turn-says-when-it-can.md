---
kind: work
status: open
updated: 2026-11-21
priority: P2
area: chat
plan: chat-html-and-presets
---

# A rate-limited turn says when it can run again

## What

The agent SDK runner reads every rate_limit_info field (packages/inference/src/backends/agent-sdk/runner.ts) and the HTTP backends parse retry-after and the x-ratelimit headers (packages/inference/src/backends/http/rate-limit-headers.ts), but the reset time, limit type and overage state reach only a log line, a stream event and a rate-limited flag. No contract, chat verb or client reads them.

## Why

A rate-limited turn cannot tell the reader when to retry or how close the plan is to its limit, though the app holds that data.

## Done when

A turn failure carries a typed rate-limit cause (reset time, limit type, overage state) from both backends, the failed-turn line says when the turn can run again, the host sees plan utilization where the provider sends it, and a test per backend drives a rate-limited turn through the composed server.

## Evidence

Filled at landing: what ran and where its output is.
