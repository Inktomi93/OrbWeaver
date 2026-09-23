---
kind: adr
status: active
updated: 2026-09-23
---

# three data classes, one contract each

## Context

Not recorded in the ledger row.

## Decision

Server truth lives ONLY in the query cache (no query-cache persister, ever); client-ephemeral state dies with the tab; durable-local state (device-scoped view/draft) is per-user-namespaced (`orb:u/<userId>/<name>`, drafts `orb-draft:u/<userId>/<name>`) and referentially self-healing — a persisted field carrying a server row id excludes an unknown id from filtering (never vetoes rows) and always renders an ACTIVE entry's chip, clearable either way, with no write-on-render auto-prune. Session recovery is single-flight (one tab runs the ladder via `navigator.locks`, siblings await its verdict) and STATE-PRESERVING (a warm tab that re-authenticates never hard-reloads solely to recover). Server truth rides only the SSE bus (`client-architecture-lockdown.md` §13) — a data payload on the cross-tab session channel is banned, keeping ONE invalidation router. Homes: `client-architecture-lockdown.md` §10a (the three-class + durable-local contract) · §12 row 12 (the session channel, `lib/session-channel.ts`) · §13 rule 7 (server-truth exclusion) · `Spine-Identity-and-Auth.md` §"Client session freshness" (pointer only — this spine owns identity RESOLUTION, not client staleness behavior). Pins: `tests/client/data/stale-session.test.ts`, `tests/client/lib/session-channel.test.ts`, `tests/client/state/create-persisted-store.test.ts`, `tests/client/features/character/lib/character-library-lens.test.ts`. Enforcers: `session-channel-boundary` (`new BroadcastChannel` outside `lib/session-channel.ts` is RED, plus the §4.6-blindness ARM B tripwire) · `persistence-boundary` (raw storage outside the two persist factories is RED).

Design: [staleness-and-session-freshness.md](../history/design/staleness-and-session-freshness.md).

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
