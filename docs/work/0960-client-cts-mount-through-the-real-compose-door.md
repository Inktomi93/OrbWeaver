---
kind: work
status: doing
updated: 2026-10-13
priority: P2
lane: codex/production-exports-989
plan: test-foundation
---

# Client CTs mount through the real compose door

## What

CTs mount through the real client compose with real registries. A story isolates only through the named exception in `ct-isolation.ts`.

## Why

A CT that mounts a hand-built tree proves a product that does not ship.

## Done when

Every CT mounts through the door or a named isolation; the CT door gate holds. A browser-world test module (a story, a `*.fixtures.tsx`, `tests/support/browser`) cannot value-import `@orb/server`; a dependency-cruiser rule with a planted control holds it, because one such import drags the server and its node modules into the CT bundle.

## Evidence

Filled at landing: what ran and where its output is.
