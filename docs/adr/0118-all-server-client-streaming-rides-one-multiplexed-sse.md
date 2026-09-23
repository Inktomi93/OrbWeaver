---
kind: adr
status: active
updated: 2026-09-23
---

# ALL server→client streaming rides ONE multiplexed SSE socket per tab

## Context

Not recorded in the ledger row.

## Decision

(`stream.connect` / `attach` / `detach`, `transport/trpc/routers/stream.ts`); every stream is a ROOM SOURCE at `transport/trpc/stream/sources/<name>.ts`; wire vocabulary (refs, frames, `STREAM_CHANNELS`, `roomKey`) homes in `@orb/contracts/stream`. **Classifications are LAW and runtime-pinned** (`room-sources.test.ts`): `chat` + `notifications` = resumable|lag (durable rewind); `automation` + `workloads` = ephemeral|collapse (a collapse room's replay is newest-per-type, never frame-by-frame; the durable `workloads.progress` COLUMN is the reconnect truth, not the stream). `resumable ⟺ lag` is a pinned equivalence. **Member visibility is PRODUCER-STAMPED** (`memberText` before the durable append, `domain/chat/substrate/member-visibility.ts`, gate `scrubber-home`) — every read seam stateless, fail-closed on undefined. **The resumable ordering barrier is per-CONNECTION** (`announcedFor` measured against `SocketCell.connectionSeq`; `goDark` ownership-checked; predecessor EVICTED at takeover) — per-connection state belongs to the connection EDGE, never the previous teardown (half-open TCP means server death-detection lags the client's reconnect by minutes). Client re-announce = bounded retry then a SURFACED room error (never a silent held room). Presence rides the `connect` RESOLVER edge. The **multi-human belt is a per-ROOM `authorizeAttach` verdict** — `stream.connect` is deliberately `authedProcedure` and can never carry procedure middleware (the PLACEMENT ruling; NO room carries the belt as of #1627, 2026-09-05, which took it off its one instance, the inbox, whose sources address a single human — a future multi-human room refuses at its own attach, never on the socket). Gate `single-stream-transport`: NO `.subscription(` outside `routers/stream.ts`; the exempt list is exactly **`chat.impersonateStream`** (request-scoped, gesture-initiated, teardown IS the cancel — §14 decision 2; revisit only if it becomes concurrent). DELETED procs: `sessions.streamUserEvents`, `rpg.stream`, `notifications.notifications`, `automation.stream`, `workloads.subscribe`. Measured: 1 socket/tab plain AND with a game open; +1 transiently while impersonating.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
