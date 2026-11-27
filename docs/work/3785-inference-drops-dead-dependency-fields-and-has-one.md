---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: inference
lane: wt/agent-aecb78d3e3ce1089b
plan: unwired-code
---

# Inference drops dead dependency fields and has one JSON fetch

## What

AgentSdkDeps.sessionStore and sessionWriter (packages/inference/src/contract/agent-sdk-backend.ts) are written in backends/agent-sdk/index.ts and never read, because the runner reads the session cache. FetchJsonResult.status and headers have no reader, while packages/inference/src/catalog/endpoint.ts probeNative hand-rolls a second fetch because it needs a non-2xx status.

## Why

Dead dependency fields mislead the next reader, and two fetch paths can drift on redirect, timeout and secret handling.

## Done when

The two AgentSdkDeps fields are gone; fetchJson can return a non-2xx answer with its status and probeNative uses it, after the lane records each case where the two paths differed and the behaviour kept; FetchJsonResult.headers is gone; the catalog and agent-sdk suites pass.

## Evidence

Filled at landing: what ran and where its output is.
