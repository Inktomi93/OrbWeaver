---
kind: tooling
status: open
updated: 2026-10-02
priority: P3
area: verify
---

# Use canonical CSS home constants in the topology gate

## What

Import CSS home constants from the shared contract in the Playwright CSS topology gate and its fixtures.

## Why

Local declarations and fixture paths duplicate canonical CSS identities and can drift when a home changes.

## Done when

The gate uses canonical CSS identities while preserving its exact production topology and independent positive and negative proof cases.

## Evidence

Source review: `/tmp/claude-launch-registry-audit/results.json`, group `css-topology-fixture-copies`. Main checked the cited definitions and consumers. Implementation and affected checks remain pending.
