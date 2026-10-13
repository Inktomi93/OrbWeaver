---
kind: work
status: doing
updated: 2026-10-13
priority: P1
lane: codex/compose-media-997
plan: test-foundation
---

# Server test composition root

## What

Build the real `entry/compose` graph through `@orb/testkit/node`. Inject database, clock, ids, random, timers, provider execution, plugin host and network edges. Domain rules remain in production; port one complete domain suite as proof.

## Why

Fake-heavy domain harnesses copy product logic, so they drift and every fix needs fixture repair.

## Done when

The root exists with every edge injectable; one domain suite runs on it with the same case list and a production mutant turning it red; its old harness is deleted; no compose closure holds a rule a test would need. `test-reach` credits the modules the ported suite drives through public entries, not every module the composed graph imports, with a planted control both ways. A composed-real test drives the memory prune through the host wiring with a resolvable embed generation, so a stubbed host read turns it red.

The single assembly home and its public doors are enforced. A copied assembly placed outside the home is refused; the genuine root, builders and edge adapters remain admitted. Use bounded import and clone controls, not repository-wide checker recertification.

## Evidence

The source reuses production HTTP, service and job composition; its current-tree freeze remains unqualified. Provider overrides script external execution, never admission, funding, accounting or persisted resolution.

Thread deterministic IDs through actual owner writes. Inject business randomness and timers through heartbeats, deadlines, retries and observers. Keep security-token randomness distinct and preserve database-owned timestamps.

Expose plugin-host execution and lifecycle. Inject imagery, scraping, installation and plugin egress without bypassing admission. Join startup, failed construction and teardown of database, runtime, workers and host resources. Deleting temporary files is not cleanup.

`packages/server/src/foundation/observability/tracing.ts` must settle `superviseSettled` after its request span and rejection report complete. Preserve status and errors; prove both outcomes through public observability.

Keep transport event buses and the chat-open tap graph-owned. Wire both publishers and subscribers through the same instance. Preserve synthetic timing and automation behavior. Prove concurrent roots with identical IDs cannot share events; disposal may finish out of order. Join aborted socket room pumps before database disposal.

Notifications supplies the replacement case set. Preserve scope, replay, standing, persistence and projection assertions. Adjudicate unused cases without fake callers; delete legacy only after matching replacement proof.

Keep unresolved notification persistence cases in legacy until intent and replacement are adjudicated. A partial port is not complete replacement. Corpus auth outputs use production HTTP construction and request identity.

Scoped controls prove resolved CIDR admission can widen a restricted hostname port. The correction rejects that path before dialing and preserves declared-port, unrelated-host and public-address admission. Root lifecycle, response-body settlement, domain replacement and combined compilation remain unqualified.

Response ownership must await physical cancellation even when a pending read observes EOF first. Immutable clone-header behavior remains an unresolved adapter boundary; native metadata alone does not establish equivalent Response semantics.

Preliminary kit, contracts and inference configs pass. Server/root compilation exposes optional forwarding, native Response, spawn and SDK helper type mismatches. Fix those concrete couplings before the bounded runtime floor. Preserve old assertions while making parked plugin reads settle on actual cancellation.
