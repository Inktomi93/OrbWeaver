---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: server
---

# Set explicit HTTP server timeouts in serve()

## What

Pass explicit `keepAliveTimeout`, `requestTimeout` and `headersTimeout` to the `serve()` call in `packages/server/src/entry/lifecycle.ts`, as named constants. The request timeout must not cut long-lived SSE streams, whose heartbeat keeps them open.

## Why

The server runs on the Node defaults, which nobody chose. The Node 26 adoption program listed this as unbuilt.

## Done when

The three values are set from named constants, a test pins them, and an SSE stream open longer than the request timeout survives.

## Evidence

Filled at landing: what ran and where its output is.
