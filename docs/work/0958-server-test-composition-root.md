---
kind: work
status: blocked
updated: 2026-10-12
priority: P1
blocked: on 964
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

Filled at landing: what ran and where its output is.
