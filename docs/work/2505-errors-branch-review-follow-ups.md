---
kind: work
status: open
updated: 2026-11-11
priority: P3
area: server
---

# Errors branch review follow-ups

## What

The code review of the errors branch left five notes, none blocking. EmbedFailedError now answers service-unavailable with developer wording in its message and writes no log record (packages/server/src/domain/embeddings/contract/errors.ts). An internal fault thrown inside a room pump is logged at warn and shows the procedure sentence where the room sentence belongs (packages/server/src/transport/trpc/stream/socket.ts). No test covers the error log line of the subscription wrapper (packages/server/src/transport/trpc/subscriptions.ts). A blocked egress writes a security event and the new cause line, two warn records for one refusal (packages/server/src/infra/network/egress.ts). Code that checks for the domain error base now treats an internal fault as a modeled refusal (the automation schedule tick and the plugin contract errors); no current path reaches one. Source: the errors review report under reports/code-reviewer.

## Why

Each is small, and together they are where the new internal-fault base and the new cause logs meet older code that assumed every domain error was a refusal.

## Done when

The embed refusal has a client-safe message and its cause is logged once. A room-pump internal fault logs at error with the room wording. The subscription wrapper's log line has a test or the wrapper shares the middleware's tested path. A blocked egress writes one record. Each domain-base check either excludes the internal-fault base or states why it should not.

## Evidence

Filled at landing: what ran and where its output is.
