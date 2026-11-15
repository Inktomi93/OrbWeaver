---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: inference
---

# A 429's Retry-After sets the wait before the retry on the HTTP wires

## What

The pre-commit retry honors a rate-limit `resetsAt`, but the HTTP error classifier never sets it, so a 429 with `Retry-After` waits the exponential backoff instead (the error classifier in `packages/inference/src/backends/http/error-classify.ts` returns a rate-limit error with no reset time). Read `retry-after` from the failed response's headers into `resetsAt`.

## Why

A retry sent before the service's stated window spends a retry attempt on a certain refusal.

## Done when

A 429 carrying `Retry-After: 2` schedules its retry 2000 ms out, proved through a chat turn on a hosted row.

## Evidence

Filled at landing: what ran and where its output is.
