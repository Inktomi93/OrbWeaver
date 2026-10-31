---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: tests
plan: test-enforcement
---

# Split the surface-walk machinery out of the product test homes

## What

The surface-walk drivers (tests/e2e/support/surface-sections.ts, surface-chat.ts, surface-character.ts, surface-config.ts) mix a walker engine, journeys and inventory bookkeeping in files of 1200 to 3000 lines; tests/support/node/surface-data.ts sits on the helpers door while loading the server graph and reading rows; surface-data.int.test.ts bundles six concerns; createServerHarness serves three jobs through overloads. Move the walker engine into a testkit home, split journeys per surface, put surface-data behind a door whose contract matches what it loads, split the int test by concern, and split the harness entries by job.

## Why

Oversized mixed files and a door that bends its own contract are where copies hide.

## Done when

No surface driver file mixes the engine with journeys; the helpers door loads no server graph; door-row-reach needs no carve-out for surface-data; each split suite still passes.

## Evidence

Filled at landing: what ran and where its output is.
