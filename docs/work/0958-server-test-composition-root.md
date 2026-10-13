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

Preparation identifies partial production seams, not a complete harness. Database and domain clocks already enter production composition. Provider overrides script external execution; they must not replace runtime admission, funding, accounting or persisted resolution.

Thread deterministic IDs through actual owner writes, including sessions, notifications, stats and nested RPG operations. Thread business randomness and timer controls through turn heartbeats, deadlines, retries and observers. Keep security-token randomness distinct. A top-level seeded-ID or clock field does not establish deterministic composition; preserve database-owned timestamp semantics.

Expose the complete plugin-host edge and its lifecycle, not only per-instance disposal. Cover outbound imagery, scraping, plugin installation and plugin egress without bypassing network admission. The root must settle startup, failed-construction cleanup and teardown of database, runtime, workers and host resources. Temporary-directory deletion alone is not cleanup.

Refresh the seam inventory after compose integration. Preserve the single production graph, world separation and complete domain-case acceptance above. Do not create a second domain assembly or claim the existing app fixture supplies every edge.
