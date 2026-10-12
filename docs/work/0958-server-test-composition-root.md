---
kind: work
status: open
updated: 2026-10-12
priority: P1
plan: test-foundation
---

# Server test composition root

## What

Add a test composition root to `@orb/testkit/node` that builds the real `entry/compose` graph and injects only the edges: database, clock, ids, random, the inference provider edge, the plugin host and the network. Production exposes each seam at its composition root. Port one domain suite onto it as the proof.

## Why

Fake-heavy domain harnesses copy product logic, so they drift and every fix needs fixture repair.

## Done when

The root exists with every edge injectable; one domain suite runs on it with the same case list and a production mutant turning it red; its old harness is deleted.

## Evidence

Filled at landing: what ran and where its output is.
