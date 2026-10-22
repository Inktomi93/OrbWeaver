---
kind: work
status: open
updated: 2026-10-21
priority: P2
plan: test-foundation
---

# Testing law holds in the test kit

## What

Qualify deterministic data, production composition, scripted external edges and joined resource lifetimes in maintained testkit support. Qualify provider recipes, cancellation reporting and software snapshots through selected cases. Remove copied assemblies from maintained support with their replacements.

## Why

Rebuilt tests need stable inputs and the actual production graph, not copied domain behavior.

## Done when

Maintained support uses production-derived data, seeded IDs and injected business time. Protocol and physical timing follow Spine-Testing section 3. Real-root controls prove deterministic behavior and joined cleanup. Provider recipes, cancellation reporting and software snapshots preserve observable outcomes. Copied assembly helpers leave with qualified replacements.

## Evidence

The server harness exposes business clock, ID, random and timer seams. Existing support has selected runtime qualification; that does not establish complete replacement coverage.

[D319](../adr/0319-native-protocol-time-in-scripted-test-edges.md) preserves native signed-protocol timestamps and verification. It does not authorize ambient business clocks.
