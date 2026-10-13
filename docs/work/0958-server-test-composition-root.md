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

Add a test composition root to `@orb/testkit/node` that builds the real `entry/compose` graph and injects only the edges: database, clock, ids, random, timers, the inference provider edge, the plugin host and the network. Production exposes each seam at its composition root. It starts from the compose that item 964 leaves: every rule already exported from its owning domain, so the root reaches each one. Port one domain suite onto it as the proof.

## Why

Fake-heavy domain harnesses copy product logic, so they drift and every fix needs fixture repair.

## Done when

The root exists with every edge injectable; one domain suite runs on it with the same case list and a production mutant turning it red; its old harness is deleted; no compose closure holds a rule a test would need. `test-reach` credits the modules the ported suite drives through public entries, not every module the composed graph imports, with a planted control both ways. A composed-real test drives the memory prune through the host wiring with a resolvable embed generation, so a stubbed host read turns it red.

The single assembly home and its public doors are enforced. A copied assembly placed outside the home is refused; the genuine root, builders and edge adapters remain admitted. Use bounded import and clone controls, not repository-wide checker recertification.

## Evidence

Production database and clock seams are partial. Provider overrides script external execution, never runtime admission, funding, accounting or persisted resolution.

Thread deterministic IDs through actual owner writes. Inject business randomness and timers through heartbeats, deadlines, retries and observers. Keep security-token randomness distinct and preserve database-owned timestamps.

Expose plugin-host execution and lifecycle. Inject imagery, scraping, installation and plugin egress without bypassing admission. Join startup, failed construction and teardown of database, runtime, workers and host resources. Deleting temporary files is not cleanup.

`packages/server/src/foundation/observability/tracing.ts` resolves `superviseSettled` before the enclosing request span closes and its rejection report completes. Repair that existing completion boundary so harness teardown joins the actual supervised operation. Preserve the existing trace status and error report; prove completion and rejection through the public observability surface.

Keep transport event buses and the chat-open tap graph-owned. Wire both publishers and subscribers through the same instance. Preserve synthetic timing and automation behavior. Prove concurrent roots with identical IDs cannot share events; disposal may finish out of order. Join aborted socket room pumps before database disposal.

Notifications supplies the replacement case set. Preserve scope, replay, standing, persistence and projection assertions. Adjudicate unused cases without fake callers; delete legacy only after matching replacement proof.

Public notification verbs can replace their copied assembly independently. Keep unresolved direct persistence cases in legacy until production intent and replacement are adjudicated. That partial port does not establish complete domain replacement. The root must also reuse production HTTP construction and request identity for corpus auth outputs.

Scoped controls prove resolved CIDR admission can widen a restricted hostname port. The correction rejects that path before dialing and preserves declared-port, unrelated-host and public-address admission. Root lifecycle, response-body settlement, domain replacement and combined compilation remain unqualified.

Response ownership must await physical cancellation even when a pending read observes EOF first. Immutable clone-header behavior remains an unresolved adapter boundary; native metadata alone does not establish equivalent Response semantics.
