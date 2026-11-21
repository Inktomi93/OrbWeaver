---
kind: work
status: open
updated: 2026-11-21
priority: P3
area: inference
plan: unwired-code
---

# The provider capability log records the served model

## What

ProviderCapabilityLog.servedModel (packages/inference/src/contract/http.ts) is read by provider-log.ts, but its only caller, emitTurnReceipts in packages/inference/src/backends/v4/result.ts, never supplies it, although its usage argument carries GenerationUsage.servedModel.

## Why

The capability log cannot say which model a router actually served.

## Done when

emitTurnReceipts passes the usage's served model, and a red-first test proves the capability log line carries it.

## Evidence

Filled at landing: what ran and where its output is.
