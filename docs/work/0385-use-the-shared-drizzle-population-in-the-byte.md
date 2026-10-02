---
kind: tooling
status: open
updated: 2026-10-02
priority: P3
area: verify
---

# Use the shared Drizzle population in the byte cast gate

## What

Replace the local schema population in byte-check-cast with DRIZZLE_SCHEMA_POPULATION from its existing shared reader module.

## Why

The gate duplicates the population its reader already owns, contrary to the reader contract.

## Done when

The gate imports the canonical population and preserves its effective scope and passing targeted proof cases.

## Evidence

Source review: `/tmp/claude-launch-registry-audit/results.json`, group `byte-check-cast-population`. Main checked the cited definitions and consumers. Implementation and affected checks remain pending.
