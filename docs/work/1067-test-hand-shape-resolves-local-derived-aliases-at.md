---
kind: tooling
status: open
updated: 2026-10-18
priority: P3
area: tooling
plan: test-foundation
---

# test-hand-shape resolves local derived aliases at production boundaries

## What

A value typed with a local alias whose body is a derived type, such as type Picked = Pick\<Owner, 'value'> or the factory pattern type XWire = TrpcWireOutput<...>, reads UNKNOWN (opaqueValue via aliasIdentity in tooling/src/floor/code-facts/shape-association.ts), while the same derived type written inline is judged.

## Why

The testing law prescribes deriving test types from production through such aliases, so they should be judged, not inflate UNKNOWN.

## Done when

A local alias whose body is a library generic or derived production type is resolved through the existing alias-type-argument step and judged like its inline form, with controls for Pick and TrpcWireOutput aliases.

## Evidence

Filled at landing: what ran and where its output is.
