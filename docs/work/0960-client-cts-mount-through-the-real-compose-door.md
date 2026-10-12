---
kind: work
status: open
updated: 2026-10-12
priority: P2
plan: test-foundation
---

# Client CTs mount through the real compose door

## What

CTs mount through the real client compose with real registries. A story isolates only through the named exception in `ct-isolation.ts`.

## Why

A CT that mounts a hand-built tree proves a product that does not ship.

## Done when

Every CT mounts through the door or a named isolation; the CT door gate holds.

## Evidence

Filled at landing: what ran and where its output is.
