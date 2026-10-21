---
kind: tooling
status: blocked
updated: 2026-10-21
priority: P3
area: tooling
blocked: owner
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

Owner-directed tooling pause: this work is parked outside the test-foundation and test-mirror programs. Preserve source and evidence; resume only with explicit owner authorization. Custody: `reports/review/tooling-park-2026-10-21/`.
