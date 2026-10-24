---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: server
plan: test-foundation
---

# The last process-wide server state moves onto each composition root

## What

Four pieces of server state are created at module load and shared by every root in a process. SERVER_INSTANCE_ID is minted with randomUUID() in foundation/server-instance/index.ts and read by entry/lifecycle.ts, entry/compose/services.ts and transport/trpc/stream/socket.ts. The log and request rings in foundation/observability/logger.ts are fed by one stream that every root's logger writes into. The audit failure counters in foundation/observability/audit.ts are module-level. The trace rings behind tracing.ts are shared the same way; the OTel provider itself is global by design.

## Why

Tests compose many production roots in one worker. Shared state lets one root see another's log lines, request records, audit failures and server instance id, and a random instance id is not seeded, so a test root is not its own production instance.

## Done when

Each root builds its instance id from its own id source and its own log ring, request ring, trace ring and audit failure counters at the composition root, passes them to the services that write them and to its debug routes; no module under packages/server/src holds them; a test with two roots in one worker shows each root's ring, counters and instance id stay separate, and fails when they are shared again; tests/support/README.md drops the note that log reads cover only lines since the first live root.

## Evidence

Filled at landing: what ran and where its output is.
