---
kind: bug
status: doing
updated: 2026-10-12
priority: P1
area: tooling
lane: wt/agent-afe5353ae9ba0f311
plan: test-mirror
---

# trpc-input-declarations and wire-json-parsed-at-consumer see the bracket spelling

## What

tests/tooling/gate-spelling-twins.int.test.ts is red on main: its ledger shows trpc-input-declarations and wire-json-parsed-at-consumer blind to the bracket spelling (obj\["key"]), last changed by item 900. Teach both gates the bracket spelling through the shared property-read reader, with planted controls.

## Why

A gate blind to one spelling of a property read misses findings, and the twins suite keeps main red.

## Done when

Both gates catch the bracket spelling and gate-spelling-twins.int passes on main.

## Evidence

Filled at landing: what ran and where its output is.
