---
kind: bug
status: doing
updated: 2026-11-27
priority: P3
area: client
lane: wt/agent-a7af6003da75d8e56
plan: unwired-code
---

# A failed room tells the user why from its error code

## What

A roomFailed control frame carries a STREAM_ERROR_CODES code (packages/contracts/src/stream/index.ts), but the client routes only its message (packages/client/src/data/bus/use-orb-socket.ts routeFrame to roomRegistry.failed), so a room the user may not open reads the same as a server that is briefly unavailable.

## Why

The server sends a closed reason the client throws away; the user cannot tell a permanent refusal from a retryable outage, and pnpm unwired codes lists every member as unhandled.

## Done when

The room failure path carries the code, the room hook branches on it exhaustively (permission and not-found say so and stop; unavailable and rate-limited say to retry), a test drives a roomFailed frame per branch, and pnpm unwired codes reports no STREAM_ERROR_CODES member unhandled.

## Evidence

Filled at landing: what ran and where its output is.
