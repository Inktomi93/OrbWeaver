---
kind: work
status: open
updated: 2026-11-22
priority: P3
area: observability
plan: unwired-code
---

# The client error report sends the failing request id

## What

clientErrorReport accepts requestId and the server logs it by name; buildClientErrorPayload never sets it.

## Why

The server side reads the field, so a report cannot be matched to its failing request.

## Done when

The client payload carries the failing request id and a test shows the server log line carries it.

## Evidence

Filled at landing: what ran and where its output is.
